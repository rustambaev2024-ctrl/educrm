import logging
from datetime import date

from celery import shared_task
from django.db import transaction
from django_tenants.utils import get_public_schema_name, get_tenant_model, schema_context

from apps.courses.models import Group
from apps.lessons.models import Attendance
from apps.students.models import Student

from .models import Payment
from .services import (
    apply_payment,
    calculate_lesson_price,
    get_or_create_wallet,
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
    today = date.today()
    weekday = today.weekday()

    for schema in _iter_tenant_schemas():
        with schema_context(schema):
            active_groups = Group.objects.filter(status="active").prefetch_related("students")

            for group in active_groups:
                lesson_days = {
                    slot.get("day")
                    for slot in (group.schedule or [])
                    if isinstance(slot, dict) and slot.get("day") is not None
                }

                if weekday not in lesson_days:
                    continue

                lesson_price = calculate_lesson_price(group, today)
                if lesson_price <= 0:
                    continue

                lesson = group.lessons.filter(datetime__date=today).first()
                if lesson and lesson.status == "cancelled":
                    continue

                # БИЗНЕС-ПРАВИЛО: списание происходит со всех студентов группы
                # независимо от посещаемости. Исключение: статус excused.
                students_to_charge = list(
                    group.students.exclude(
                        status__in=["frozen", "archived", "graduate", "expelled"]
                    ).select_related("user")
                )
                if not students_to_charge:
                    continue

                student_ids = [s.id for s in students_to_charge]

                # ОПТИМИЗАЦИЯ 1: один запрос для всех attendance этой группы
                if lesson:
                    attendance_map = {
                        att.student_id: att
                        for att in Attendance.objects.filter(
                            lesson=lesson, student_id__in=student_ids
                        )
                    }
                else:
                    attendance_map = {}

                # ОПТИМИЗАЦИЯ 2: один запрос для проверки уже списанных
                already_charged_ids = set(
                    Payment.objects.filter(
                        student_id__in=student_ids,
                        group=group,
                        payment_type="charge",
                        created_at__date=today,
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
                            get_or_create_wallet(student)
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
                    except Exception as e:
                        logger.error(f"Charge failed for student {student.id}: {e}")

                # ОПТИМИЗАЦИЯ 4: bulk update is_charged одним запросом
                if charged_attendance_ids:
                    Attendance.objects.filter(id__in=charged_attendance_ids).update(is_charged=True)

            logger.info(f"daily_lesson_charge completed for schema '{schema}'")


@shared_task
def update_debtor_statuses():
    for schema in _iter_tenant_schemas():
        with schema_context(schema):
            updated = 0
            for student in Student.objects.filter(status="debtor", wallet_balance__gte=0):
                student.status = "active"
                student.save(update_fields=["status"])
                updated += 1
            if updated:
                logger.info(f"update_debtor_statuses: {updated} students updated in '{schema}'")
