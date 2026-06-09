import pytest
from decimal import Decimal
from django.utils import timezone

from tests.factories import StudentFactory, StaffFactory, GroupFactory, PaymentFactory, BranchFactory

pytestmark = pytest.mark.django_db


def _make_charge_payment(student, group, amount):
    """Создаёт прямое Payment типа charge для группы (без вызова apply_payment)."""
    from apps.finance.models import Payment, Wallet
    wallet, _ = Wallet.objects.get_or_create(student=student, defaults={"balance": student.wallet_balance})
    return Payment.objects.create(
        student=student,
        wallet=wallet,
        group=group,
        branch=student.branch,
        payment_type="charge",
        amount=amount,
        balance_before=student.wallet_balance,
        balance_after=student.wallet_balance - amount,
        category="tuition",
    )


class TestCalculateTeacherSalary:
    """Тесты функции calculate_teacher_salary из reports/services.py"""

    def test_salary_calculated_from_group_charges(self):
        """Зарплата считается как процент от суммы списаний за группы учителя"""
        from apps.reports.services import calculate_teacher_salary
        branch = BranchFactory()
        teacher = StaffFactory(salary_percent=Decimal("30.00"), branch=branch)
        group = GroupFactory(teacher=teacher, branch=branch)
        student = StudentFactory(branch=branch, wallet_balance=Decimal("500000.00"))

        _make_charge_payment(student, group, Decimal("100000.00"))

        today = timezone.now().date()
        result = calculate_teacher_salary(
            teacher_id=teacher.id,
            period_start=today.replace(day=1),
            period_end=today,
        )

        # 30% от 100000 = 30000
        assert Decimal(result["calculated_salary"]) == Decimal("30000.00")

    def test_salary_zero_when_no_charges(self):
        """Зарплата 0 если нет списаний за период"""
        from apps.reports.services import calculate_teacher_salary
        teacher = StaffFactory(salary_percent=Decimal("30.00"))

        today = timezone.now().date()
        result = calculate_teacher_salary(
            teacher_id=teacher.id,
            period_start=today.replace(day=1),
            period_end=today,
        )

        assert Decimal(result["calculated_salary"]) == Decimal("0.00")

    def test_penalties_reduce_net_salary(self):
        """Штрафы уменьшают чистую зарплату"""
        from apps.reports.services import calculate_teacher_salary
        from apps.staff.models import StaffPenalty
        branch = BranchFactory()
        teacher = StaffFactory(salary_percent=Decimal("30.00"), branch=branch)
        group = GroupFactory(teacher=teacher, branch=branch)
        student = StudentFactory(branch=branch, wallet_balance=Decimal("500000.00"))

        _make_charge_payment(student, group, Decimal("100000.00"))

        today = timezone.now().date()
        StaffPenalty.objects.create(
            staff=teacher,
            amount=Decimal("5000.00"),
            reason="Late arrival",
            penalty_date=today,
            status="active",
        )

        result = calculate_teacher_salary(
            teacher_id=teacher.id,
            period_start=today.replace(day=1),
            period_end=today,
        )

        # 30% от 100000 = 30000, минус штраф 5000 = 25000
        assert Decimal(result["net_salary"]) == Decimal("25000.00")

    def test_net_salary_not_negative(self):
        """Чистая зарплата не может быть отрицательной"""
        from apps.reports.services import calculate_teacher_salary
        from apps.staff.models import StaffPenalty
        teacher = StaffFactory(salary_percent=Decimal("30.00"))

        today = timezone.now().date()
        # Огромный штраф без начислений
        StaffPenalty.objects.create(
            staff=teacher,
            amount=Decimal("999999.00"),
            reason="Test penalty",
            penalty_date=today,
            status="active",
        )

        result = calculate_teacher_salary(
            teacher_id=teacher.id,
            period_start=today.replace(day=1),
            period_end=today,
        )

        assert Decimal(result["net_salary"]) >= Decimal("0.00")

    def test_cancelled_penalties_not_counted(self):
        """Отменённые штрафы не влияют на зарплату"""
        from apps.reports.services import calculate_teacher_salary
        from apps.staff.models import StaffPenalty
        branch = BranchFactory()
        teacher = StaffFactory(salary_percent=Decimal("30.00"), branch=branch)
        group = GroupFactory(teacher=teacher, branch=branch)
        student = StudentFactory(branch=branch, wallet_balance=Decimal("500000.00"))

        _make_charge_payment(student, group, Decimal("100000.00"))

        today = timezone.now().date()
        StaffPenalty.objects.create(
            staff=teacher,
            amount=Decimal("10000.00"),
            reason="Cancelled penalty",
            penalty_date=today,
            status="cancelled",  # отменён — не считается
        )

        result = calculate_teacher_salary(
            teacher_id=teacher.id,
            period_start=today.replace(day=1),
            period_end=today,
        )

        # Штраф не засчитан — чистая = расчётная = 30000
        assert Decimal(result["net_salary"]) == Decimal("30000.00")

    def test_absent_charge_excluded_from_salary(self):
        """Списания категории absent_charge не идут в зарплату учителя"""
        from apps.reports.services import calculate_teacher_salary
        from apps.finance.models import Payment, Wallet
        branch = BranchFactory()
        teacher = StaffFactory(salary_percent=Decimal("30.00"), branch=branch)
        group = GroupFactory(teacher=teacher, branch=branch)
        student = StudentFactory(branch=branch, wallet_balance=Decimal("500000.00"))

        # Обычное списание — идёт в зарплату
        _make_charge_payment(student, group, Decimal("100000.00"))

        # Списание за пропуск — НЕ идёт в зарплату
        wallet, _ = Wallet.objects.get_or_create(student=student, defaults={"balance": student.wallet_balance})
        Payment.objects.create(
            student=student,
            wallet=wallet,
            group=group,
            branch=branch,
            payment_type="charge",
            amount=Decimal("50000.00"),
            balance_before=Decimal("400000.00"),
            balance_after=Decimal("350000.00"),
            category="absent_charge",
        )

        today = timezone.now().date()
        result = calculate_teacher_salary(
            teacher_id=teacher.id,
            period_start=today.replace(day=1),
            period_end=today,
        )

        # 30% только от 100000 = 30000 (absent_charge исключён)
        assert Decimal(result["calculated_salary"]) == Decimal("30000.00")

    def test_invalid_teacher_id_raises_validation_error(self):
        """Несуществующий teacher_id вызывает ValidationError"""
        from apps.reports.services import calculate_teacher_salary
        from django.core.exceptions import ValidationError
        import uuid
        today = timezone.now().date()

        with pytest.raises(ValidationError):
            calculate_teacher_salary(
                teacher_id=uuid.uuid4(),
                period_start=today.replace(day=1),
                period_end=today,
            )
