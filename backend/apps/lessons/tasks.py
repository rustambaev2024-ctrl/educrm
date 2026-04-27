from datetime import date, datetime, time, timedelta

from celery import shared_task
from django.utils import timezone

from apps.courses.models import Group

from .models import Lesson


def _parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def _parse_time(value: str) -> time:
    return datetime.strptime(value, "%H:%M").time()


@shared_task
def generate_lessons_for_group(group_id: str, from_date: str, to_date: str) -> int:
    group = Group.objects.select_related("teacher", "room").get(id=group_id)
    start = _parse_date(from_date)
    end = _parse_date(to_date)
    if start > end:
        return 0

    created = 0
    current = start
    schedule_slots = group.schedule or []

    while current <= end:
        weekday = current.weekday()
        for slot in schedule_slots:
            if slot.get("day") != weekday:
                continue

            start_time = slot.get("start_time")
            if not start_time:
                continue

            lesson_datetime = datetime.combine(current, _parse_time(start_time))
            if timezone.is_naive(lesson_datetime):
                lesson_datetime = timezone.make_aware(
                    lesson_datetime,
                    timezone.get_current_timezone(),
                )

            exists = Lesson.objects.filter(group=group, datetime=lesson_datetime).exists()
            if exists:
                continue

            Lesson.objects.create(
                group=group,
                datetime=lesson_datetime,
                room=group.room,
                teacher=group.teacher,
                status="scheduled",
            )
            created += 1
        current += timedelta(days=1)

    return created
