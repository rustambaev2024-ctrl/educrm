"""
Отбор списаний за несуществовавшие уроки должен быть точным.

Команда возвращает клиентам деньги, поэтому цена ошибки двусторонняя:
пропустить фантомное списание — не вернуть человеку его деньги, зацепить
лишнее — вернуть то, что было списано законно.
"""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.finance.management.commands.refund_phantom_charges import (
    not_yet_reversed,
    phantom_charges,
)
from apps.finance.models import Payment
from apps.finance.services import apply_payment, reverse_payment
from apps.lessons.models import Lesson
from tests.factories import BranchFactory, GroupFactory, StaffFactory, StudentFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def setup():
    branch = BranchFactory()
    teacher = StaffFactory(branch=branch)
    group = GroupFactory(teacher=teacher, branch=branch)
    student = StudentFactory(branch=branch, wallet_balance=Decimal("0.00"))
    return branch, group, student


def _charge(student, group, *, lesson=None, comment="Daily lesson charge for 2026-08-15"):
    return apply_payment(
        student=student,
        payment_type="charge",
        amount=Decimal("40000.00"),
        group=group,
        lesson=lesson,
        comment=comment,
        suppress_notifications=True,
    ).payment


def test_phantom_charge_is_found(setup):
    _, group, student = setup
    _charge(student, group)

    assert phantom_charges().count() == 1


def test_charge_tied_to_a_lesson_is_not_touched(setup):
    branch, group, student = setup
    lesson = Lesson.objects.create(
        group=group, teacher=group.teacher, datetime=timezone.now(), status="conducted"
    )
    _charge(student, group, lesson=lesson)

    assert phantom_charges().count() == 0, (
        "законное списание за реальный урок возвращать нельзя"
    )


def test_manual_admin_charge_is_not_touched(setup):
    """Ручное списание администратора — другой тип и другой комментарий."""
    _, group, student = setup
    apply_payment(
        student=student,
        payment_type="manual_charge",
        amount=Decimal("15000.00"),
        group=group,
        comment="Учебник",
        suppress_notifications=True,
    )

    assert phantom_charges().count() == 0


def test_charge_with_a_custom_comment_is_not_touched(setup):
    """Списание типа charge, созданное руками через API, — не наша цель."""
    _, group, student = setup
    _charge(student, group, comment="Оплата за индивидуальное занятие")

    assert phantom_charges().count() == 0


def test_since_filter_limits_the_window(setup):
    _, group, student = setup
    _charge(student, group)
    tomorrow = timezone.localdate() + timedelta(days=1)

    assert phantom_charges().count() == 1
    assert phantom_charges(since=tomorrow).count() == 0


def test_already_refunded_charge_is_skipped(setup):
    """Повторный запуск команды не должен вернуть деньги дважды."""
    _, group, student = setup
    charge = _charge(student, group)

    assert len(not_yet_reversed(phantom_charges())) == 1

    reverse_payment(charge)

    assert not_yet_reversed(phantom_charges()) == [], (
        "уже возвращённое списание обязано выпасть из выборки"
    )


def test_refund_returns_the_money_to_the_wallet(setup):
    _, group, student = setup
    charge = _charge(student, group)
    student.refresh_from_db()
    assert student.wallet_balance == Decimal("-40000.00")

    reverse_payment(charge)

    student.refresh_from_db()
    assert student.wallet_balance == Decimal("0.00")
    assert Payment.objects.filter(student=student, payment_type="refund").count() == 1
