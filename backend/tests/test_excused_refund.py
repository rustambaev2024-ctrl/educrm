"""Отметка «уважительная причина» должна вернуть уже списанные деньги.

daily_lesson_charge проверяет статус excused только в момент списания (23:00).
Учитель, отметивший причину на следующий день или исправивший отметку,
деньги не возвращал — списание оставалось висеть на балансе.
"""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.finance.models import Payment
from apps.finance.services import apply_payment
from apps.lessons.models import Attendance, Lesson
from tests.factories import BranchFactory, GroupFactory, StaffFactory, StudentFactory

pytestmark = pytest.mark.django_db


def _lesson_with_charge():
    branch = BranchFactory()
    teacher = StaffFactory(branch=branch)
    group = GroupFactory(teacher=teacher, branch=branch)
    student = StudentFactory(branch=branch, wallet_balance=Decimal("0.00"))
    lesson = Lesson.objects.create(
        group=group,
        teacher=teacher,
        datetime=timezone.now() - timedelta(hours=2),
        status="scheduled",
    )
    apply_payment(
        student=student,
        payment_type="charge",
        amount=Decimal("50000.00"),
        group=group,
        lesson=lesson,
        comment="Daily lesson charge for test",
    )
    student.refresh_from_db()
    assert student.wallet_balance == Decimal("-50000.00")
    return student, lesson


def test_marking_excused_returns_the_money():
    student, lesson = _lesson_with_charge()

    Attendance.objects.create(lesson=lesson, student=student, status="excused")

    student.refresh_from_db()
    assert student.wallet_balance == Decimal("0.00")
    assert Payment.objects.filter(student=student, payment_type="refund").count() == 1


def test_changing_an_existing_mark_to_excused_returns_the_money():
    student, lesson = _lesson_with_charge()
    attendance = Attendance.objects.create(lesson=lesson, student=student, status="absent")

    student.refresh_from_db()
    assert student.wallet_balance == Decimal("-50000.00"), "отметка absent деньги не возвращает"

    attendance.status = "excused"
    attendance.save()

    student.refresh_from_db()
    assert student.wallet_balance == Decimal("0.00")


def test_money_is_returned_only_once():
    student, lesson = _lesson_with_charge()
    attendance = Attendance.objects.create(lesson=lesson, student=student, status="excused")

    attendance.save()  # повторное сохранение той же отметки
    attendance.save()

    student.refresh_from_db()
    assert student.wallet_balance == Decimal("0.00")
    assert Payment.objects.filter(student=student, payment_type="refund").count() == 1


def test_present_does_not_return_anything():
    student, lesson = _lesson_with_charge()

    Attendance.objects.create(lesson=lesson, student=student, status="present")

    student.refresh_from_db()
    assert student.wallet_balance == Decimal("-50000.00")
