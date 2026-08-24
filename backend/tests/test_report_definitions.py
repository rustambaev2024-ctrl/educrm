"""
Отчёты обязаны считать по определениям из apps.core.definitions.

Три находки аудита 9 августа 2026, закрытые здесь:

1. Уважительный пропуск попадал в знаменатель посещаемости в сводном отчёте,
   но не попадал во фронте и в отчёте по учителям. Чем аккуратнее центр
   оформлял справки, тем ниже была его посещаемость в отчёте.
2. Выручка на бэкенде не вычитала отмены пополнений, а фронт вычитал: ошибочное
   пополнение вместе с исправлением давало двойную выручку.
3. «Активные ученики» в отчёте включали замороженных, а на панели — нет.
"""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.core.definitions import ACTIVE_STUDENT_STATUSES
from apps.finance.services import apply_payment, reverse_payment
from apps.lessons.models import Attendance, Lesson
from apps.reports.services import ReportFilters, get_overview
from tests.factories import (
    BranchFactory,
    GroupFactory,
    StaffFactory,
    StudentFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def director():
    return UserFactory(role="director")


@pytest.fixture
def filters():
    today = timezone.localdate()
    return ReportFilters(date_from=today - timedelta(days=7), date_to=today)


def _lesson(branch):
    teacher = StaffFactory(branch=branch)
    group = GroupFactory(teacher=teacher, branch=branch)
    return Lesson.objects.create(
        group=group,
        teacher=teacher,
        datetime=timezone.now() - timedelta(hours=2),
        status="conducted",
    )


def test_excused_absence_does_not_lower_attendance(director, filters):
    """Один пришёл, один по справке → 100%, а не 50%."""
    branch = BranchFactory()
    lesson = _lesson(branch)
    Attendance.objects.create(
        lesson=lesson, student=StudentFactory(branch=branch), status="present"
    )
    Attendance.objects.create(
        lesson=lesson, student=StudentFactory(branch=branch), status="excused"
    )

    overview = get_overview(director, filters)

    assert overview["attendance_rate"] == "100.00", (
        "уважительный пропуск не должен попадать в знаменатель — иначе метрика "
        "наказывает центр за аккуратно оформленные справки"
    )


def test_real_absence_still_lowers_attendance(director, filters):
    """Обратная проверка: прогул считается, иначе первый тест ничего не мерит."""
    branch = BranchFactory()
    lesson = _lesson(branch)
    Attendance.objects.create(
        lesson=lesson, student=StudentFactory(branch=branch), status="present"
    )
    Attendance.objects.create(
        lesson=lesson, student=StudentFactory(branch=branch), status="absent"
    )

    assert get_overview(director, filters)["attendance_rate"] == "50.00"


def test_late_counts_as_present(director, filters):
    branch = BranchFactory()
    lesson = _lesson(branch)
    Attendance.objects.create(
        lesson=lesson, student=StudentFactory(branch=branch), status="late"
    )

    assert get_overview(director, filters)["attendance_rate"] == "100.00"


def test_cancelled_top_up_leaves_no_revenue(director, filters):
    """Пополнение и его отмена в сумме дают ноль, а не двойную выручку."""
    branch = BranchFactory()
    student = StudentFactory(branch=branch, wallet_balance=Decimal("0.00"))
    result = apply_payment(
        student=student,
        payment_type="top_up",
        amount=Decimal("300000.00"),
        suppress_notifications=True,
    )

    assert get_overview(director, filters)["revenue_total"] == "300000.00"

    reverse_payment(result.payment)

    assert get_overview(director, filters)["revenue_total"] == "0.00", (
        "отмена пополнения создаёт manual_charge и обязана вычитаться из выручки"
    )


def test_manual_top_up_counts_as_revenue(director, filters):
    branch = BranchFactory()
    apply_payment(
        student=StudentFactory(branch=branch),
        payment_type="manual_top_up",
        amount=Decimal("120000.00"),
        suppress_notifications=True,
    )

    assert get_overview(director, filters)["revenue_total"] == "120000.00"


def test_lesson_charge_is_not_revenue(director, filters):
    """Списание за урок — не поступление в кассу."""
    branch = BranchFactory()
    apply_payment(
        student=StudentFactory(branch=branch),
        payment_type="charge",
        amount=Decimal("50000.00"),
        suppress_notifications=True,
    )

    assert get_overview(director, filters)["revenue_total"] == "0.00"


def test_frozen_student_is_not_active(director, filters):
    """«Активные ученики» — это те, кто учится сейчас; заморозка и есть пауза."""
    branch = BranchFactory()
    StudentFactory(branch=branch, status="active")
    StudentFactory(branch=branch, status="frozen")
    StudentFactory(branch=branch, status="expelled")

    overview = get_overview(director, filters)

    assert overview["students_total"] == 3
    assert overview["students_active"] == 1
    assert "frozen" not in ACTIVE_STUDENT_STATUSES


def test_debtors_are_counted_by_balance_not_status(director, filters):
    """
    Статус "debtor" умеет расходиться с балансом — считаем по балансу.
    Ученик с отрицательным балансом и статусом "active" обязан попасть в
    должники, а ученик со статусом "debtor" и нулевым балансом — нет.
    """
    branch = BranchFactory()
    StudentFactory(branch=branch, status="active", wallet_balance=Decimal("-1000.00"))
    StudentFactory(branch=branch, status="debtor", wallet_balance=Decimal("0.00"))

    assert get_overview(director, filters)["debtors_count"] == 1
