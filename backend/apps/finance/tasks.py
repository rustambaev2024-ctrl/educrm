import logging
from datetime import date

from celery import shared_task
from django.db import transaction

from apps.courses.models import Group
from apps.students.models import Student

from .services import (
    apply_payment,
    calculate_lesson_price,
    get_or_create_wallet,
)

logger = logging.getLogger(__name__)


@shared_task
def daily_lesson_charge():
    today = date.today()
    weekday = today.weekday()

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
        students_to_charge = group.students.exclude(status__in=["frozen", "archived", "graduate", "expelled"])
        
        for student in students_to_charge:
            try:
                with transaction.atomic():
                    get_or_create_wallet(student)
                    apply_payment(
                        student=student,
                        payment_type="charge",
                        amount=lesson_price,
                        group=group,
                        lesson=lesson,
                        comment=f"Daily lesson charge for {today}",
                    )
                    if lesson:
                        from apps.lessons.models import Attendance
                        Attendance.objects.filter(lesson=lesson, student=student).update(is_charged=True)
            except Exception as e:
                logger.error(f"Failed to charge student {student.id} for group {group.id}: {e}")


@shared_task
def update_debtor_statuses():
    for student in Student.objects.filter(status="debtor", wallet_balance__gte=0):
        student.status = "active"
        student.save(update_fields=["status"])
