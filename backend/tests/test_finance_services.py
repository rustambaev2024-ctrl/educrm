import pytest
from decimal import Decimal

from tests.factories import StudentFactory, WalletFactory, GroupFactory

pytestmark = pytest.mark.django_db


def make_student(balance=Decimal("0.00"), status="active"):
    """Создаёт студента; apply_payment сам создаст Wallet через get_or_create."""
    return StudentFactory(wallet_balance=balance, status=status)


class TestApplyPayment:
    """Тесты функции apply_payment"""

    def test_top_up_increases_balance(self):
        """Пополнение увеличивает баланс студента"""
        from apps.finance.services import apply_payment
        student = make_student(Decimal("0.00"))

        apply_payment(student=student, payment_type="top_up", amount=Decimal("100000"))

        student.refresh_from_db()
        assert student.wallet_balance == Decimal("100000.00")

    def test_charge_decreases_balance(self):
        """Списание уменьшает баланс студента"""
        from apps.finance.services import apply_payment
        student = make_student(Decimal("200000.00"))

        apply_payment(student=student, payment_type="charge", amount=Decimal("50000"))

        student.refresh_from_db()
        assert student.wallet_balance == Decimal("150000.00")

    def test_charge_sets_debtor_status_when_balance_negative(self):
        """При уходе в минус студент получает статус debtor"""
        from apps.finance.services import apply_payment
        from unittest.mock import patch
        student = make_student(Decimal("30000.00"), status="active")

        with patch("apps.notifications.services.NotificationService.notify"):
            apply_payment(student=student, payment_type="charge", amount=Decimal("50000"))

        student.refresh_from_db()
        assert student.status == "debtor"
        assert student.wallet_balance == Decimal("-20000.00")

    def test_top_up_restores_active_status_from_debtor(self):
        """Пополнение возвращает статус active если был debtor"""
        from apps.finance.services import apply_payment
        student = make_student(Decimal("-50000.00"), status="debtor")

        apply_payment(student=student, payment_type="top_up", amount=Decimal("100000"))

        student.refresh_from_db()
        assert student.status == "active"

    def test_frozen_student_status_not_changed_on_negative_balance(self):
        """Замороженный студент не получает статус debtor при уходе в минус"""
        from apps.finance.services import apply_payment
        student = make_student(Decimal("30000.00"), status="frozen")

        apply_payment(student=student, payment_type="charge", amount=Decimal("50000"))

        student.refresh_from_db()
        assert student.status == "frozen"

    def test_expelled_student_status_not_changed_on_top_up(self):
        """Отчисленный студент не получает статус active при пополнении"""
        from apps.finance.services import apply_payment
        student = make_student(Decimal("-50000.00"), status="expelled")

        apply_payment(student=student, payment_type="top_up", amount=Decimal("100000"))

        student.refresh_from_db()
        assert student.status == "expelled"

    def test_graduate_student_status_not_changed(self):
        """Выпускник не меняет статус через финансовые операции"""
        from apps.finance.services import apply_payment
        student = make_student(Decimal("0.00"), status="graduate")

        apply_payment(student=student, payment_type="charge", amount=Decimal("50000"))

        student.refresh_from_db()
        assert student.status == "graduate"

    def test_archived_student_status_not_changed(self):
        """Архивированный студент не меняет статус"""
        from apps.finance.services import apply_payment
        student = make_student(Decimal("0.00"), status="archived")

        apply_payment(student=student, payment_type="charge", amount=Decimal("50000"))

        student.refresh_from_db()
        assert student.status == "archived"

    def test_wallet_balance_synced_with_student_balance(self):
        """Баланс кошелька синхронизирован с балансом студента"""
        from apps.finance.services import apply_payment
        from apps.finance.models import Wallet
        student = make_student(Decimal("0.00"))

        apply_payment(student=student, payment_type="top_up", amount=Decimal("75000"))

        student.refresh_from_db()
        wallet = Wallet.objects.get(student=student)
        assert wallet.balance == student.wallet_balance == Decimal("75000.00")

    def test_payment_record_created(self):
        """После apply_payment создаётся запись Payment"""
        from apps.finance.services import apply_payment
        from apps.finance.models import Payment
        student = make_student(Decimal("0.00"))

        apply_payment(student=student, payment_type="top_up", amount=Decimal("100000"))

        assert Payment.objects.filter(
            student=student,
            payment_type="top_up",
            amount=Decimal("100000.00"),
        ).exists()

    def test_amount_zero_raises_error(self):
        """Нулевая сумма вызывает ValueError"""
        from apps.finance.services import apply_payment
        student = make_student()

        with pytest.raises(ValueError):
            apply_payment(student=student, payment_type="top_up", amount=Decimal("0"))

    def test_invalid_payment_type_raises_error(self):
        """Неизвестный тип платежа вызывает ValueError"""
        from apps.finance.services import apply_payment
        student = make_student()

        with pytest.raises(ValueError):
            apply_payment(student=student, payment_type="invalid_type", amount=Decimal("100000"))


class TestReversePayment:
    """Тесты функции reverse_payment"""

    def test_reverse_top_up_restores_balance(self):
        """Отмена пополнения возвращает баланс к исходному"""
        from apps.finance.services import apply_payment, reverse_payment
        student = make_student(Decimal("0.00"))

        result = apply_payment(student=student, payment_type="top_up", amount=Decimal("100000"))
        reverse_payment(result.payment)

        student.refresh_from_db()
        assert student.wallet_balance == Decimal("0.00")

    def test_reverse_manual_charge_restores_balance(self):
        """Отмена ручного списания возвращает деньги"""
        from apps.finance.services import apply_payment, reverse_payment
        student = make_student(Decimal("200000.00"))

        result = apply_payment(student=student, payment_type="manual_charge", amount=Decimal("50000"))
        reverse_payment(result.payment)

        student.refresh_from_db()
        assert student.wallet_balance == Decimal("200000.00")

    def test_reverse_manual_top_up_decreases_balance(self):
        """Отмена ручного пополнения убирает деньги"""
        from apps.finance.services import apply_payment, reverse_payment
        student = make_student(Decimal("0.00"))

        result = apply_payment(student=student, payment_type="manual_top_up", amount=Decimal("50000"))
        student.refresh_from_db()
        assert student.wallet_balance == Decimal("50000.00")

        reverse_payment(result.payment)
        student.refresh_from_db()
        assert student.wallet_balance == Decimal("0.00")

    def test_reverse_creates_compensating_payment(self):
        """Отмена создаёт компенсирующий платёж"""
        from apps.finance.services import apply_payment, reverse_payment
        from apps.finance.models import Payment
        student = make_student(Decimal("0.00"))

        result = apply_payment(student=student, payment_type="top_up", amount=Decimal("100000"))
        reverse_payment(result.payment)

        # После top_up отмена создаёт charge с комментарием Reversal of payment...
        assert Payment.objects.filter(
            student=student,
            payment_type="charge",
            comment__startswith="Reversal of payment",
        ).exists()

    def test_reverse_refund_raises_error(self):
        """Нельзя отменить уже созданный refund"""
        from apps.finance.services import apply_payment, reverse_payment
        from apps.finance.models import Payment
        # Создаём refund напрямую — через apply_payment нельзя создать refund напрямую
        student = make_student(Decimal("100000.00"))
        # Сначала создаём wallet через apply_payment
        from apps.finance.services import get_or_create_wallet
        wallet = get_or_create_wallet(student)
        refund_payment = Payment.objects.create(
            student=student,
            wallet=wallet,
            payment_type="refund",
            amount=Decimal("10000.00"),
            balance_before=Decimal("100000.00"),
            balance_after=Decimal("110000.00"),
        )

        with pytest.raises(ValueError, match="Cannot reverse a refund payment"):
            reverse_payment(refund_payment)


class TestCalculateLessonPrice:
    """Тесты функции calculate_lesson_price"""

    def test_price_positive_for_group_with_schedule(self):
        """Цена за урок положительна для группы с расписанием"""
        from apps.finance.services import calculate_lesson_price
        from django.utils import timezone
        group = GroupFactory(
            monthly_price=Decimal("600000.00"),
            schedule=[{"day": 0}, {"day": 2}, {"day": 4}],  # пн, ср, пт
        )
        price = calculate_lesson_price(group, timezone.now().date())

        assert price > Decimal("0.00")
        assert price < Decimal("600000.00")

    def test_price_zero_when_no_schedule(self):
        """Пустое расписание даёт цену 0 (защита от деления на ноль)"""
        from apps.finance.services import calculate_lesson_price
        from django.utils import timezone
        group = GroupFactory(
            monthly_price=Decimal("600000.00"),
            schedule=[],
        )
        # Не должно падать с ZeroDivisionError
        price = calculate_lesson_price(group, timezone.now().date())
        assert price == Decimal("0.00")

    def test_price_multiplied_by_lessons_approximately_equals_monthly(self):
        """Сумма всех уроков за месяц примерно равна месячной цене (с погрешностью округления)"""
        from apps.finance.services import calculate_lesson_price
        import calendar
        from django.utils import timezone

        today = timezone.now().date()
        group = GroupFactory(
            monthly_price=Decimal("600000.00"),
            schedule=[{"day": 0}, {"day": 2}, {"day": 4}],
        )
        price = calculate_lesson_price(group, today)

        year, month = today.year, today.month
        _, days_in_month = calendar.monthrange(year, month)
        lesson_days = {0, 2, 4}
        from datetime import date
        count = sum(
            1 for d in range(1, days_in_month + 1)
            if date(year, month, d).weekday() in lesson_days
        )
        total = price * count
        # Разница не более 1 сума на весь месяц из-за ROUND_HALF_UP
        assert abs(total - Decimal("600000.00")) <= Decimal("1.00")
