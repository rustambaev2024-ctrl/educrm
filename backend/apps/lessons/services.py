from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any

from django.utils import timezone

from apps.courses.models import Group

from .models import Lesson


def _parse_time(value: str) -> time:
    return datetime.strptime(value, "%H:%M").time()


def slot_weekday(slot: dict[str, Any]) -> int | None:
    """День недели слота расписания в конвенции Python (пн=0..вс=6).

    Расписание хранится как пн=1..вс=7, поэтому сырое значение сравнивать с
    date.weekday() нельзя — получится сдвиг на день. Биллинг обязан звать
    именно эту функцию, а не читать slot["day"] напрямую.
    """
    raw = slot.get("day")
    if raw is None:
        raw = slot.get("day_of_week")
    if raw is None:
        return None

    value = int(raw)
    # Frontend stores Monday=1..Sunday=7. Keep legacy 0..6 support.
    if 1 <= value <= 7:
        return value - 1
    if 0 <= value <= 6:
        return value
    return None


def _slot_start(slot: dict[str, Any]) -> str | None:
    value = slot.get("start") or slot.get("start_time")
    return str(value) if value else None


def generate_lessons_for_group_sync(
    group: Group,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    horizon_days: int = 90,
) -> int:
    """Create scheduled Lesson rows from a group's weekly schedule."""
    start = max(from_date or group.start_date, group.start_date)
    end = to_date or (start + timedelta(days=horizon_days))
    if group.end_date:
        end = min(end, group.end_date)
    if start > end:
        return 0

    schedule_slots = group.schedule or []
    if not schedule_slots:
        return 0

    created = 0
    current = start
    tz = timezone.get_current_timezone()

    while current <= end:
        current_weekday = current.weekday()
        for slot in schedule_slots:
            if slot_weekday(slot) != current_weekday:
                continue

            start_time = _slot_start(slot)
            if not start_time:
                continue

            lesson_datetime = datetime.combine(current, _parse_time(start_time))
            if timezone.is_naive(lesson_datetime):
                lesson_datetime = timezone.make_aware(lesson_datetime, tz)

            _, was_created = Lesson.objects.get_or_create(
                group=group,
                datetime=lesson_datetime,
                defaults={
                    "room": group.room,
                    "teacher": group.teacher,
                    "status": "scheduled",
                },
            )
            if was_created:
                created += 1
        current += timedelta(days=1)

    return created


def resync_lessons_for_group(group: Group, *, horizon_days: int = 90) -> int:
    """Re-align a group's not-yet-occurred lessons with its current schedule.

    `generate_lessons_for_group_sync` only ever creates missing rows — it
    never touches ones that already exist, so editing `group.schedule` (a
    time change, a day change) silently left every already-generated future
    `Lesson` on the OLD schedule forever (found on prod 2026-08-08: two
    groups had been retimed via the admin UI but their calendar kept running
    at the original time). Only `status="scheduled"` rows dated today or
    later are removed — `conducted`/`cancelled`/`rescheduled` lessons carry
    real attendance/history and must never be touched by a schedule edit.
    """
    today = timezone.localdate()
    # Урок, на который что-то перенесли, стоит вне расписания — он и создан
    # вручную взамен другого. Раньше он попадал под удаление наравне с
    # обычными: правка расписания молча стирала перенос, у старого урока
    # оставалась метка «перенесён» и указатель в пустоту, а занятие исчезало
    # из календаря — ни ученик, ни учитель его больше не видели.
    Lesson.objects.filter(
        group=group,
        datetime__date__gte=today,
        status="scheduled",
        rescheduled_from__isnull=True,
    ).delete()
    return generate_lessons_for_group_sync(group, from_date=today, horizon_days=horizon_days)
