import logging
from datetime import date

from celery import shared_task
from django.db import transaction
from django_tenants.utils import get_public_schema_name, get_tenant_model, schema_context

from apps.courses.models import Group
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
                students_to_charge = group.students.exclude(
                    status__in=["frozen", "archived", "graduate", "expelled"]
                )

                for student in students_to_charge:
                    from apps.lessons.models import Attendance

                    # --- Защита от двойного списания ---
                    # 1. Проверяем is_charged в Attendance
                    if lesson:
                        att = Attendance.objects.filter(
                            lesson=lesson, student=student
                        ).first()
                        if att and att.is_charged:
                            continue  # уже списано за этот урок
                        if att and att.status == "excused":
                            continue  # освобождён

                    # 2. Проверяем наличие Payment за сегодня для этой группы
                    already_charged = Payment.objects.filter(
                        student=student,
                        group=group,
                        payment_type="charge",
                        created_at__date=today,
                    ).exists()
                    if already_charged:
                        continue  # пропустить — уже списано сегодня

                    try:
                        with transaction.atomic():
                            get_or_create_wallet(student)

                            # Determine category based on attendance
                            cat = "tuition"
                            if lesson:
                                att = Attendance.objects.filter(
                                    lesson=lesson, student=student
                                ).first()
                                if att and att.status == "absent":
                                    cat = "absent_charge"

                            apply_payment(
                                student=student,
                                payment_type="charge",
                                amount=lesson_price,
                                group=group,
                                lesson=lesson,
                                category=cat,
                                comment=f"Daily lesson charge for {today}",
                            )
                            if lesson:
                                Attendance.objects.filter(
                                    lesson=lesson, student=student
                                ).update(is_charged=True)
                    except Exception as e:
                        logger.error(
                            f"Failed to charge student {student.id} "
                            f"for group {group.id}: {e}"
                        )

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
