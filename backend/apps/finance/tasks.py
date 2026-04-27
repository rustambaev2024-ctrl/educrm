from celery import shared_task
from django.db import transaction

from apps.lessons.models import Attendance
from apps.students.models import Student

from .services import (
    CHARGEABLE_ATTENDANCE_STATUSES,
    apply_payment,
    calculate_lesson_price,
    get_or_create_wallet,
)


@shared_task
def charge_attendance(attendance_id: str):
    with transaction.atomic():
        attendance = (
            Attendance.objects.select_for_update()
            .select_related("lesson__group", "student")
            .filter(id=attendance_id)
            .first()
        )
        if attendance is None or attendance.is_charged:
            return

        if attendance.status not in CHARGEABLE_ATTENDANCE_STATUSES:
            return

        lesson = attendance.lesson
        group = lesson.group
        lesson_price = calculate_lesson_price(group, lesson.datetime.date())
        get_or_create_wallet(attendance.student)
        apply_payment(
            student=attendance.student,
            payment_type="charge",
            amount=lesson_price,
            group=group,
            lesson=lesson,
            comment=f"Auto charge for lesson {lesson.id}",
        )
        attendance.is_charged = True
        attendance.save(update_fields=["is_charged", "updated_at"])


@shared_task
def update_debtor_statuses():
    for student in Student.objects.filter(status="debtor", wallet_balance__gte=0):
        student.status = "active"
        student.save(update_fields=["status"])
