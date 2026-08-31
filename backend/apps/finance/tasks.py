import logging
from datetime import date

from celery import shared_task
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from django_tenants.utils import get_public_schema_name, get_tenant_model, schema_context

from apps.courses.models import Group
from apps.lessons.models import Attendance
from apps.lessons.services import slot_weekday
from apps.students.models import Student

from .models import Payment
from .services import (
    apply_payment,
    calculate_lesson_price,
)

logger = logging.getLogger(__name__)


def _iter_tenant_schemas():
    """Yield each non-public tenant schema name."""
    tenant_model = get_tenant_model()
    public = get_public_schema_name()
    for tenant in tenant_model.objects.exclude(schema_name=public).iterator():
        yield tenant.schema_name


@shared_task
def daily_lesson_charge():
    # localdate(), а не date.today(): контейнер живёт в UTC (в Dockerfile TZ
    # не задан), а платформа — в Asia/Tashkent (TIME_ZONE). date.today() даёт
    # дату UTC, и с 00:00 до 05:00 по Ташкенту это ВЧЕРАШНИЙ день: и день
    # недели для расписания, и границы для запросов брались за вчера.
    # Расписанному запуску в 23:00 повезло (18:00 UTC — та же дата), но
    # ручной триггер /api/v1/trigger-daily-charge/ ночью списывал за вчера.
    today = timezone.localdate()
    weekday = today.weekday()

    # Списание запускается и по расписанию, и вручную через
    # /api/v1/trigger-daily-charge/. Проверка already_charged_ids ниже не
    # спасает от одновременного запуска: оба прогона успевают её пройти до
    # того, как хоть один создаст платёж, — и списывают дважды.
    # cache.add в Redis атомарен (SET NX), поэтому замок берёт только один.
    lock_key = f"daily_lesson_charge:{today}"
    if not cache.add(lock_key, "running", timeout=3600):
        logger.warning("daily_lesson_charge уже выполняется для %s — пропускаем", today)
        return

    try:
        _charge_all_tenants(today, weekday)
    finally:
        cache.delete(lock_key)


def _charge_all_tenants(today: date, weekday: int):
    """Обходит организации и пишет ИТОГ, а не просто «завершено».

    Раньше в журнал уходило "completed for schema X" независимо от того,
    списалось хоть что-то или ни копейки. По такой записи нельзя отличить
    рабочую ночь от полностью сломанной — и именно поэтому о списаниях в
    пустоту узнали от клиентов, а не из логов.
    """
    grand_charged = 0
    grand_skipped = 0
    for schema in _iter_tenant_schemas():
        with schema_context(schema):
            charged, skipped = charge_groups_for_day(today, weekday)
            grand_charged += charged
            grand_skipped += skipped
            logger.info(
                "daily_lesson_charge %s: списаний %s, групп без урока %s (%s)",
                schema,
                charged,
                skipped,
                today,
            )
    if grand_skipped:
        # Группа, у которой в её же учебный день нет занятия, — расхождение
        # расписания и календаря. Раньше по нему молча списывали деньги.
        logger.warning(
            "daily_lesson_charge: %s групп в учебный день остались без урока "
            "— проверьте, указано ли у них ВРЕМЯ в расписании",
            grand_skipped,
        )
    return grand_charged, grand_skipped


def charge_groups_for_day(today: date, weekday: int) -> tuple[int, int]:
    """Списание за занятия одного дня в ТЕКУЩЕЙ схеме.

    Возвращает (сколько списаний создано, сколько групп пропущено из-за
    отсутствия урока).

    Вынесено из обхода тенантов, чтобы логику можно было проверить тестом:
    _charge_all_tenants требует django_tenants и настоящий Postgres, поэтому
    сам расчёт списаний до сих пор не был покрыт ни одним тестом.
    """
    charged_total = 0
    groups_without_lesson = 0
    active_groups = Group.objects.filter(
        status__in=["active", "recruiting"]
    ).prefetch_related("students")

    for group in active_groups:
        lesson_days = {
            slot_weekday(slot)
            for slot in (group.schedule or [])
            if isinstance(slot, dict)
        } - {None}

        if weekday not in lesson_days:
            continue

        lesson_price = calculate_lesson_price(group, today)
        if lesson_price <= 0:
            continue

        # Списание привязано к РЕАЛЬНОМУ уроку, а не к записи в расписании.
        #
        # Расписание (Group.schedule) — вечное правило «по понедельникам»,
        # а уроки создаёт generate_lessons_for_group_sync, и он учитывает
        # четыре вещи, которых в расписании нет: start_date группы, end_date,
        # наличие времени начала у слота и конечный горизонт генерации.
        # Пока биллинг смотрел только в расписание, каждое из этих
        # расхождений давало списание в день, когда занятия не было вовсе, —
        # ровно жалоба клиентов в августе 2026. Плюс у такого платежа
        # lesson_id = NULL, и отметка «уважительная причина» не могла его
        # вернуть: сигнал ищет списания по уроку.
        lesson = (
            group.lessons.filter(datetime__date=today)
            .order_by("datetime")
            .first()
        )
        if lesson is None:
            # Не тихий пропуск: если у активной группы в её же учебный день
            # нет урока — это расхождение данных, и его надо видеть в логах,
            # а не узнавать от клиента.
            groups_without_lesson += 1
            logger.warning(
                "daily_lesson_charge: у группы %s (%s) на %s нет урока, "
                "хотя расписание этот день включает — списание пропущено",
                group.id,
                group.name,
                today,
            )
            continue
        # "rescheduled" пропускается наравне с "cancelled": перенесённый урок
        # оплачивается в новую дату, иначе за одно занятие спишут дважды.
        if lesson.status in ("cancelled", "rescheduled"):
            continue

        # БИЗНЕС-ПРАВИЛО: списание происходит со всех студентов группы
        # независимо от посещаемости. Исключение: статус excused.
        # ВАЖНО: только активные участники группы (left_at IS NULL),
        # удалённые из группы студенты не должны получать списания.
        members = (
            group.memberships.filter(left_at__isnull=True)
            .select_related("student__user")
            .exclude(
                student__status__in=["frozen", "archived", "graduate", "expelled"]
            )
        )
        students_to_charge = [m.student for m in members]
        if not students_to_charge:
            continue

        student_ids = [s.id for s in students_to_charge]

        # ОПТИМИЗАЦИЯ 1: один запрос для всех attendance этой группы
        attendance_map = {
            att.student_id: att
            for att in Attendance.objects.filter(
                lesson=lesson, student_id__in=student_ids
            )
        }

        # ОПТИМИЗАЦИЯ 2: один запрос для проверки уже списанных.
        #
        # Ключ идемпотентности — УРОК, а не дата создания платежа. Раньше
        # стояло `created_at__date=today`, то есть сравнивались расчётный день
        # и календарный день записи в БД. Они расходятся при любом запуске
        # «не в тот день»: ручной триггер ночью, повтор после сбоя, прогон,
        # переваливший за полночь, и просто разные часовые пояса —
        # created_at__date считается в Asia/Tashkent, а today приходил из
        # date.today(), то есть из UTC контейнера. При расхождении защита
        # молча не срабатывала и ученику списывали второй раз.
        already_charged_ids = set(
            Payment.objects.filter(
                student_id__in=student_ids,
                lesson=lesson,
                payment_type="charge",
            ).values_list("student_id", flat=True)
        )

        # Фильтруем студентов для списания
        students_to_process = []
        for student in students_to_charge:
            if student.id in already_charged_ids:
                continue
            att = attendance_map.get(student.id)
            if att and att.is_charged:
                continue
            if att and att.status == "excused":
                continue
            students_to_process.append((student, att))

        # ОПТИМИЗАЦИЯ 3: обрабатываем только нужных
        charged_attendance_ids = []
        for student, att in students_to_process:
            try:
                with transaction.atomic():
                    cat = "absent_charge" if (att and att.status == "absent") else "tuition"
                    apply_payment(
                        student=student,
                        payment_type="charge",
                        amount=lesson_price,
                        group=group,
                        lesson=lesson,
                        category=cat,
                        comment=f"Daily lesson charge for {today}",
                    )
                    if att:
                        charged_attendance_ids.append(att.id)
                    charged_total += 1
            except Exception as e:
                logger.error(f"Charge failed for student {student.id}: {e}")

        # ОПТИМИЗАЦИЯ 4: bulk update is_charged одним запросом
        if charged_attendance_ids:
            Attendance.objects.filter(id__in=charged_attendance_ids).update(is_charged=True)

    return charged_total, groups_without_lesson


@shared_task
def update_debtor_statuses():
    """Приводит статус "debtor" в соответствие с балансом.

    Чинилось только одно направление: должник с погашенным долгом становился
    активным, а активный ученик, ушедший в минус, должником не становился —
    статус отставал от баланса, и списки должников на разных экранах
    расходились. Оба направления теперь здесь.

    Статусы вне цикла активный/должник (frozen, archived, graduate, expelled)
    не трогаем — тем же правилом, что и finance.services._status_changed_for_combined_balance.
    """
    for schema in _iter_tenant_schemas():
        with schema_context(schema):
            cleared = Student.objects.filter(
                status="debtor", wallet_balance__gte=0
            ).update(status="active")
            marked = Student.objects.filter(
                status="active", wallet_balance__lt=0
            ).update(status="debtor")
            if cleared or marked:
                logger.info(
                    "update_debtor_statuses в '%s': погашено %s, помечено должниками %s",
                    schema,
                    cleared,
                    marked,
                )
