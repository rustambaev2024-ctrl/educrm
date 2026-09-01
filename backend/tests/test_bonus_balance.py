"""
Тесты бонусного баланса ученика (feature/student-bonus-balance).

См. дизайн-спеку: docs/superpowers/specs/2026-08-31-student-bonus-balance-design.md,
раздел "Тестирование". Конвенции скопированы с backend/tests/test_finance_services.py
(тот же стиль: pytestmark = pytest.mark.django_db, фабрики из tests.factories,
apply_payment сам создаёт Wallet через get_or_create).
"""
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.utils import timezone

from tests.factories import (
    BranchFactory,
    GroupFactory,
    GroupMembershipFactory,
    LessonFactory,
    StudentFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


def make_student(balance=Decimal("0.00"), bonus=Decimal("0.00"), status="active", branch=None):
    """Создаёт студента с заданными main/bonus балансами.

    ВАЖНО (проверено по реальному коду, не по спеке): при создании Student
    срабатывает apps/finance/signals.py::ensure_wallet_for_student и сразу
    создаёт Wallet — но синхронизирует туда только `balance`
    (defaults={"balance": instance.wallet_balance}), про bonus_balance сигнал
    не знает. Поэтому просто передать bonus_balance в StudentFactory(...)
    недостаточно: Wallet всё равно родится с bonus_balance=0, а
    get_or_create_wallet() досинхронизирует со студентом только `balance`,
    не бонус (см. его код). В проде это не баг — бонус всегда появляется
    ПОСЛЕ регистрации ученика, отдельной операцией apply_payment(
    funding_source="bonus"), а не в момент создания Student. Здесь же для
    тестового стартового состояния бонус выставляется явно, вторым шагом,
    на Wallet и Student одновременно.
    """
    kwargs = dict(wallet_balance=balance, status=status)
    if branch is not None:
        kwargs["branch"] = branch
    student = StudentFactory(**kwargs)
    if bonus:
        from apps.finance.services import get_or_create_wallet

        wallet = get_or_create_wallet(student)
        wallet.bonus_balance = bonus
        wallet.save(update_fields=["bonus_balance"])
        student.bonus_balance = bonus
        student.save(update_fields=["bonus_balance"])
    return student


class TestBonusGrant:
    """Начисление бонуса: apply_payment(payment_type='top_up', funding_source='bonus')."""

    def test_top_up_bonus_increases_bonus_balance_not_main(self):
        from apps.finance.services import apply_payment

        student = make_student(balance=Decimal("1000.00"), bonus=Decimal("0.00"))

        result = apply_payment(
            student=student,
            payment_type="top_up",
            amount=Decimal("5000"),
            funding_source="bonus",
        )

        student.refresh_from_db()
        assert result.payment.funding_source == "bonus"
        assert student.bonus_balance == Decimal("5000.00")
        # Основной баланс не тронут.
        assert student.wallet_balance == Decimal("1000.00")


class TestChargeForLesson:
    """Списание за урок: charge_for_lesson — разбивка main/bonus."""

    def test_full_main_coverage_creates_single_payment(self):
        """Основной баланс полностью покрывает цену — бонус не тронут, одна запись."""
        from apps.finance.models import Payment
        from apps.finance.services import charge_for_lesson

        student = make_student(balance=Decimal("10000.00"), bonus=Decimal("0.00"))
        group = GroupFactory()
        lesson = LessonFactory(group=group)

        results = charge_for_lesson(
            student=student, group=group, lesson=lesson, lesson_price=Decimal("5000.00")
        )

        assert len(results) == 1
        assert results[0].payment.funding_source == "main"
        student.refresh_from_db()
        assert student.wallet_balance == Decimal("5000.00")
        assert student.bonus_balance == Decimal("0.00")
        assert Payment.objects.filter(student=student, payment_type="charge").count() == 1

    def test_split_charge_main_and_bonus(self):
        """Ядро фичи: main=3000, bonus=5000, цена=5000 -> 3000 с main + 2000 с bonus."""
        student = make_student(balance=Decimal("3000.00"), bonus=Decimal("5000.00"))
        group = GroupFactory()
        lesson = LessonFactory(group=group)

        from apps.finance.services import charge_for_lesson

        results = charge_for_lesson(
            student=student, group=group, lesson=lesson, lesson_price=Decimal("5000.00")
        )

        assert len(results) == 2
        bonus_result, main_result = results

        assert bonus_result.payment.funding_source == "bonus"
        assert bonus_result.payment.amount == Decimal("2000.00")
        assert bonus_result.payment.balance_before == Decimal("5000.00")
        assert bonus_result.payment.balance_after == Decimal("3000.00")

        assert main_result.payment.funding_source == "main"
        assert main_result.payment.amount == Decimal("3000.00")
        assert main_result.payment.balance_before == Decimal("3000.00")
        assert main_result.payment.balance_after == Decimal("0.00")

        student.refresh_from_db()
        assert student.wallet_balance == Decimal("0.00")
        assert student.bonus_balance == Decimal("3000.00")

    def test_charge_when_main_already_negative_bonus_covers_then_main_goes_further_negative(self):
        """main=-2000 (уже отрицательный, "недоступен") -> бонус пытается покрыть всё
        (3000 из 5000), непокрытый остаток (2000) уходит на main, уводя его глубже в минус."""
        student = make_student(balance=Decimal("-2000.00"), bonus=Decimal("3000.00"))
        group = GroupFactory()
        lesson = LessonFactory(group=group)

        from apps.finance.services import charge_for_lesson

        results = charge_for_lesson(
            student=student, group=group, lesson=lesson, lesson_price=Decimal("5000.00")
        )

        assert len(results) == 2
        bonus_result, main_result = results

        assert bonus_result.payment.funding_source == "bonus"
        assert bonus_result.payment.amount == Decimal("3000.00")
        assert bonus_result.payment.balance_before == Decimal("3000.00")
        assert bonus_result.payment.balance_after == Decimal("0.00")

        assert main_result.payment.funding_source == "main"
        assert main_result.payment.amount == Decimal("2000.00")
        assert main_result.payment.balance_before == Decimal("-2000.00")
        assert main_result.payment.balance_after == Decimal("-4000.00")

        student.refresh_from_db()
        assert student.wallet_balance == Decimal("-4000.00")
        assert student.bonus_balance == Decimal("0.00")


class TestDebtorStatusCombinedBalance:
    """Статус 'debtor' считается по сумме main+bonus, не по одному main."""

    def test_bonus_grant_keeps_active_student_not_debtor(self):
        """main=0, начислили бонус 5000 -> не должник."""
        from apps.finance.services import apply_payment

        student = make_student(balance=Decimal("0.00"), bonus=Decimal("0.00"), status="active")

        apply_payment(
            student=student, payment_type="top_up", amount=Decimal("5000"), funding_source="bonus"
        )

        student.refresh_from_db()
        assert student.status != "debtor"

    def test_bonus_grant_flips_debtor_to_active_when_combined_covers(self):
        """main=-1000, статус уже debtor; начислили бонус 2000 -> combined=+1000 -> active."""
        from apps.finance.services import apply_payment

        student = make_student(balance=Decimal("-1000.00"), bonus=Decimal("0.00"), status="debtor")

        apply_payment(
            student=student, payment_type="top_up", amount=Decimal("2000"), funding_source="bonus"
        )

        student.refresh_from_db()
        assert student.status == "active"
        assert student.wallet_balance == Decimal("-1000.00")
        assert student.bonus_balance == Decimal("2000.00")

    def test_bonus_insufficient_student_remains_debtor(self):
        """main=-1000, статус debtor; начислили бонус всего 500 -> combined=-500 -> остаётся debtor."""
        from apps.finance.services import apply_payment

        student = make_student(balance=Decimal("-1000.00"), bonus=Decimal("0.00"), status="debtor")

        apply_payment(
            student=student, payment_type="top_up", amount=Decimal("500"), funding_source="bonus"
        )

        student.refresh_from_db()
        assert student.status == "debtor"
        assert student.wallet_balance == Decimal("-1000.00")
        assert student.bonus_balance == Decimal("500.00")


class TestReversal:
    """reverse_payment: возврат идёт в тот же счёт (funding_source), откуда списали/начислили."""

    def test_reverse_bonus_funded_charge_credits_bonus_not_main(self):
        """Списание за урок с бонуса -> сторно возвращает деньги в bonus_balance, не в balance."""
        from apps.finance.services import charge_for_lesson, reverse_payment

        student = make_student(balance=Decimal("0.00"), bonus=Decimal("5000.00"))
        group = GroupFactory()
        lesson = LessonFactory(group=group)

        results = charge_for_lesson(
            student=student, group=group, lesson=lesson, lesson_price=Decimal("2000.00")
        )
        assert len(results) == 1
        charge_payment = results[0].payment
        assert charge_payment.funding_source == "bonus"

        student.refresh_from_db()
        assert student.bonus_balance == Decimal("3000.00")
        assert student.wallet_balance == Decimal("0.00")

        reverse_payment(charge_payment)

        student.refresh_from_db()
        assert student.bonus_balance == Decimal("5000.00")
        assert student.wallet_balance == Decimal("0.00")

    def test_reverse_bonus_grant_capped_at_remaining_bonus_balance(self):
        """Начислили 5000 бонуса, потратили 3000 (остаток 2000). Отмена исходного
        начисления 5000 обрезается до min(5000, 2000)=2000 -> manual_charge на 2000
        -> bonus_balance: 2000 -> 0 (не уходит в минус)."""
        from apps.finance.services import apply_payment, reverse_payment

        student = make_student(balance=Decimal("0.00"), bonus=Decimal("0.00"))

        grant_result = apply_payment(
            student=student, payment_type="top_up", amount=Decimal("5000"), funding_source="bonus"
        )
        apply_payment(
            student=student, payment_type="charge", amount=Decimal("3000"), funding_source="bonus"
        )

        student.refresh_from_db()
        assert student.bonus_balance == Decimal("2000.00")

        reverse_result = reverse_payment(grant_result.payment)

        assert reverse_result.payment.payment_type == "manual_charge"
        assert reverse_result.payment.funding_source == "bonus"
        assert reverse_result.payment.amount == Decimal("2000.00")

        student.refresh_from_db()
        assert student.bonus_balance == Decimal("0.00")

    def test_reverse_bonus_grant_fully_spent_raises_value_error(self):
        """Начислили 5000, потратили все 5000 (остаток 0). Отмена исходного начисления
        должна упасть с ValueError и не создавать никаких платежей/менять баланс."""
        from apps.finance.models import Payment
        from apps.finance.services import apply_payment, reverse_payment

        student = make_student(balance=Decimal("0.00"), bonus=Decimal("0.00"))

        grant_result = apply_payment(
            student=student, payment_type="top_up", amount=Decimal("5000"), funding_source="bonus"
        )
        apply_payment(
            student=student, payment_type="charge", amount=Decimal("5000"), funding_source="bonus"
        )

        student.refresh_from_db()
        assert student.bonus_balance == Decimal("0.00")
        payments_before = Payment.objects.filter(student=student).count()

        with pytest.raises(ValueError, match="already been fully spent"):
            reverse_payment(grant_result.payment)

        student.refresh_from_db()
        assert student.bonus_balance == Decimal("0.00")
        assert Payment.objects.filter(student=student).count() == payments_before

    def test_refund_lesson_charges_reverses_both_split_charges(self):
        """refund_lesson_charges на уроке со split-списанием (main+bonus) -> оба
        Payment отменяются, оба счёта восстановлены до состояния ДО списания."""
        from apps.finance.models import Payment
        from apps.finance.services import charge_for_lesson, refund_lesson_charges

        student = make_student(balance=Decimal("3000.00"), bonus=Decimal("5000.00"))
        group = GroupFactory()
        lesson = LessonFactory(group=group)

        charge_for_lesson(
            student=student, group=group, lesson=lesson, lesson_price=Decimal("5000.00")
        )
        student.refresh_from_db()
        assert student.wallet_balance == Decimal("0.00")
        assert student.bonus_balance == Decimal("3000.00")

        refunded_count = refund_lesson_charges(lesson=lesson)

        assert refunded_count == 2
        student.refresh_from_db()
        assert student.wallet_balance == Decimal("3000.00")
        assert student.bonus_balance == Decimal("5000.00")

        refund_payments = Payment.objects.filter(
            student=student,
            payment_type="refund",
            comment__startswith="Reversal of payment",
        )
        assert refund_payments.count() == 2
        assert set(refund_payments.values_list("funding_source", flat=True)) == {"main", "bonus"}


def make_bonus_covered_student(branch):
    """main=-1000, bonus=2000 -> combined=+1000: НЕ должник, но старое правило
    "wallet_balance < 0" (до фикса) сочло бы его должником. Ученик специально
    создаётся со status='active', чтобы проверить именно ветку "не пометить
    ошибочно должником" в update_debtor_statuses (marked = ... status='active'
    ... combined_balance__lt=0). Использует make_student — см. его докстринг
    про то, почему bonus_balance нельзя просто передать в StudentFactory."""
    return make_student(
        balance=Decimal("-1000.00"),
        bonus=Decimal("2000.00"),
        status="active",
        branch=branch,
    )


class TestCombinedBalanceCrossConsistency:
    """Кросс-проверка: ученик с main=-1000, bonus=2000 (combined=+1000) не должен
    считаться должником НИ В ОДНОМ из потребителей with_combined_balance/
    is_debtor_balance. Один и тот же ученик проверяется во всех потребителях,
    которые практично покрыть юнит-тестом без реального Postgres/tenant-схем:

    Покрыто:
      - with_combined_balance() (сам хелпер, apps/core/definitions.py)
      - BranchViewSet.debtors (apps/institutions/views.py) — через APIClient
      - get_overview / get_debtors_report / get_daily_report / get_group_report
        (apps/reports/services.py) — прямой вызов, чистые функции
      - update_debtor_statuses (apps/finance/tasks.py) — прямой вызов с патчем
        _iter_tenant_schemas/schema_context (тот же приём, что уже используется
        в tests/test_homework_overdue_task.py для тестирования одной "схемы"
        под SQLite без django_tenants/Postgres)

    Сознательно НЕ покрыто здесь: debtor_reminder и send_debtor_sms
    (apps/notifications/tasks.py) — они тоже используют with_combined_balance
    (тот же общий хелпер, что уже проверен ниже), но не входят в обязательный
    список задачи №16 ("AT LEAST" перечисляет ровно эти 6 потребителей + сама
    функция). Добавление их сюда потребовало бы мокать NotificationService/
    EskizSmsService без дополнительной гарантии сверх того, что даёт тест на
    сам with_combined_balance — расходование объёма без прироста уверенности.
    """

    def test_with_combined_balance_annotation(self):
        from apps.core.definitions import with_combined_balance
        from apps.students.models import Student

        branch = BranchFactory()
        student = make_bonus_covered_student(branch)

        annotated = with_combined_balance(Student.objects.filter(id=student.id)).get()

        assert annotated.combined_balance == Decimal("1000.00")

    def test_branch_debtors_endpoint_excludes_bonus_covered_student(self, api_client):
        branch = BranchFactory()
        student = make_bonus_covered_student(branch)
        director = UserFactory(role="director")
        api_client.force_authenticate(user=director)

        response = api_client.get(f"/api/v1/branches/{branch.id}/debtors/")

        assert response.status_code == 200, response.content
        student_ids = {row["student_id"] for row in response.json()["results"]}
        assert str(student.id) not in student_ids

    def test_get_overview_excludes_bonus_covered_student_from_debtors_count(self):
        from apps.reports.services import ReportFilters, get_overview

        branch = BranchFactory()
        make_bonus_covered_student(branch)
        director = UserFactory(role="director")
        filters = ReportFilters(date_from=date(2000, 1, 1), date_to=date(2100, 1, 1))

        overview = get_overview(director, filters)

        assert overview["debtors_count"] == 0

    def test_get_debtors_report_excludes_bonus_covered_student(self):
        from apps.reports.services import ReportFilters, get_debtors_report

        branch = BranchFactory()
        student = make_bonus_covered_student(branch)
        director = UserFactory(role="director")
        filters = ReportFilters(date_from=date(2000, 1, 1), date_to=date(2100, 1, 1))

        report = get_debtors_report(director, filters)

        assert report["debtors_count"] == 0
        assert all(row["student_id"] != str(student.id) for row in report["results"])

    def test_get_daily_report_total_debt_excludes_bonus_covered_student(self):
        from apps.reports.services import get_daily_report

        branch = BranchFactory()
        make_bonus_covered_student(branch)
        director = UserFactory(role="director")

        report = get_daily_report(director, timezone.localdate())

        assert report["finance"]["total_debt"] == "0.00"

    def test_get_group_report_excludes_bonus_covered_student_from_debtors(self):
        from apps.reports.services import get_group_report

        branch = BranchFactory()
        student = make_bonus_covered_student(branch)
        group = GroupFactory(branch=branch)
        GroupMembershipFactory(group=group, student=student)

        report = get_group_report(group.id)

        assert report["kpi"]["debtors_count"] == 0
        assert all(d["student_id"] != str(student.id) for d in report["debtors"])

    def test_update_debtor_statuses_does_not_mark_bonus_covered_student_as_debtor(self):
        from apps.finance import tasks as finance_tasks

        branch = BranchFactory()
        student = make_bonus_covered_student(branch)

        class _NoOpSchemaCtx:
            def __init__(self, schema):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

        with patch.object(finance_tasks, "_iter_tenant_schemas", return_value=iter(["public"])), \
                patch.object(finance_tasks, "schema_context", _NoOpSchemaCtx):
            finance_tasks.update_debtor_statuses()

        student.refresh_from_db()
        assert student.status == "active"


class TestPaymentCreateSerializerFundingSource:
    """funding_source='bonus' разрешён только вместе с payment_type='top_up'."""

    def test_bonus_top_up_validates(self):
        from apps.finance.serializers import PaymentCreateSerializer

        branch = BranchFactory()
        student = StudentFactory(branch=branch)
        director = UserFactory(role="director")

        serializer = PaymentCreateSerializer(
            data={
                "student_id": str(student.id),
                "payment_type": "top_up",
                "funding_source": "bonus",
                "amount": "5000.00",
            },
            context={"request": SimpleNamespace(user=director)},
        )

        assert serializer.is_valid(), serializer.errors

    @pytest.mark.parametrize("payment_type", ["charge", "manual_charge"])
    def test_bonus_funding_source_rejected_for_non_top_up_payment_types(self, payment_type):
        from apps.finance.serializers import PaymentCreateSerializer

        branch = BranchFactory()
        student = StudentFactory(branch=branch)
        director = UserFactory(role="director")

        serializer = PaymentCreateSerializer(
            data={
                "student_id": str(student.id),
                "payment_type": payment_type,
                "funding_source": "bonus",
                "amount": "5000.00",
            },
            context={"request": SimpleNamespace(user=director)},
        )

        assert not serializer.is_valid()
        assert "funding_source" in serializer.errors
