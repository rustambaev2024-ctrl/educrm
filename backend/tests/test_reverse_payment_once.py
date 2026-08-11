"""
Один платёж нельзя отменить дважды.

Отмену запускают три независимых источника: кнопка «отменить» в финансах,
сигнал «уважительная причина» на отметке посещаемости и команда возврата
ошибочных списаний. Проверка «уже отменён» жила только во вьюхе и внутри
сигнала — то есть снаружи транзакции. Два вызова, пришедшие одновременно,
проходили её оба, и деньги возвращались дважды.
"""

from decimal import Decimal

import pytest

from apps.finance.models import Payment
from apps.finance.services import apply_payment, reverse_payment
from tests.factories import BranchFactory, GroupFactory, StaffFactory, StudentFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def charge():
    branch = BranchFactory()
    group = GroupFactory(teacher=StaffFactory(branch=branch), branch=branch)
    student = StudentFactory(branch=branch, wallet_balance=Decimal("0.00"))
    payment = apply_payment(
        student=student,
        payment_type="charge",
        amount=Decimal("50000.00"),
        group=group,
        suppress_notifications=True,
    ).payment
    return student, payment


def test_second_reversal_is_refused(charge):
    student, payment = charge

    reverse_payment(payment)

    with pytest.raises(ValueError, match="already reversed"):
        reverse_payment(payment)

    student.refresh_from_db()
    assert student.wallet_balance == Decimal("0.00"), (
        "вторая отмена вернула бы деньги ещё раз и увела баланс в плюс"
    )
    assert Payment.objects.filter(student=student, payment_type="refund").count() == 1


def test_first_reversal_still_works(charge):
    """Опорная точка: запрет не должен ломать обычную отмену."""
    student, payment = charge

    reverse_payment(payment)

    student.refresh_from_db()
    assert student.wallet_balance == Decimal("0.00")


def test_top_up_reversal_is_also_guarded(charge):
    """Отмена пополнения — тот же путь, та же защита."""
    student, _ = charge
    top_up = apply_payment(
        student=student,
        payment_type="top_up",
        amount=Decimal("200000.00"),
        suppress_notifications=True,
    ).payment

    reverse_payment(top_up)
    with pytest.raises(ValueError, match="already reversed"):
        reverse_payment(top_up)

    student.refresh_from_db()
    assert student.wallet_balance == Decimal("-50000.00"), (
        "баланс = списание 50000 + пополнение 200000 − его отмена 200000"
    )
