import pytest
from datetime import date, timedelta
from decimal import Decimal

from tests.factories import (
    BranchFactory, CourseFactory, GroupFactory, PaymentFactory,
    StaffFactory, StudentFactory, UserFactory, WalletFactory,
)

pytestmark = pytest.mark.django_db


def _director():
    return UserFactory(role="director")


def _wide_filters(branch_id=None):
    from apps.reports.services import ReportFilters
    return ReportFilters(date_from=date(2000, 1, 1), date_to=date(2100, 1, 1), branch_id=branch_id)


class TestRevenueReportBreakdowns:
    def test_by_course_groups_payments_by_group_course(self):
        from apps.reports.services import get_revenue_report

        branch = BranchFactory()
        course_a = CourseFactory(name="Course A")
        course_b = CourseFactory(name="Course B")
        group_a = GroupFactory(branch=branch, course=course_a)
        group_b = GroupFactory(branch=branch, course=course_b)
        student = StudentFactory(branch=branch)
        WalletFactory(student=student)
        PaymentFactory(student=student, branch=branch, group=group_a, payment_type="top_up", amount=Decimal("100000.00"))
        PaymentFactory(student=student, branch=branch, group=group_b, payment_type="top_up", amount=Decimal("50000.00"))

        report = get_revenue_report(_director(), _wide_filters())

        by_course = {row["course_name"]: row["total"] for row in report["by_course"]}
        assert by_course["Course A"] == "100000.00"
        assert by_course["Course B"] == "50000.00"

    def test_by_teacher_groups_payments_by_group_teacher(self):
        from apps.reports.services import get_revenue_report

        branch = BranchFactory()
        teacher = StaffFactory(branch=branch)
        group = GroupFactory(branch=branch, teacher=teacher)
        student = StudentFactory(branch=branch)
        WalletFactory(student=student)
        PaymentFactory(student=student, branch=branch, group=group, payment_type="top_up", amount=Decimal("70000.00"))

        report = get_revenue_report(_director(), _wide_filters())

        row = next(r for r in report["by_teacher"] if r["teacher_id"] == str(teacher.id))
        assert row["total"] == "70000.00"
        assert row["teacher_name"] == teacher.user.full_name

    def test_by_teacher_groups_payment_without_group_as_unassigned(self):
        from apps.reports.services import get_revenue_report

        branch = BranchFactory()
        student = StudentFactory(branch=branch)
        WalletFactory(student=student)
        PaymentFactory(student=student, branch=branch, group=None, payment_type="top_up", amount=Decimal("30000.00"))

        report = get_revenue_report(_director(), _wide_filters())

        unassigned = next(r for r in report["by_teacher"] if r["teacher_id"] is None)
        assert unassigned["total"] == "30000.00"


class TestTeachersReportRevenue:
    def test_revenue_total_sums_payments_for_teachers_groups(self):
        from apps.reports.services import get_teachers_report

        branch = BranchFactory()
        teacher = StaffFactory(branch=branch)
        group = GroupFactory(branch=branch, teacher=teacher)
        student = StudentFactory(branch=branch)
        WalletFactory(student=student)
        PaymentFactory(student=student, branch=branch, group=group, payment_type="top_up", amount=Decimal("120000.00"))

        report = get_teachers_report(_director(), _wide_filters())

        row = next(r for r in report["results"] if r["teacher_id"] == str(teacher.id))
        assert row["revenue_total"] == "120000.00"

    def test_revenue_total_is_zero_for_teacher_without_payments(self):
        from apps.reports.services import get_teachers_report

        branch = BranchFactory()
        teacher = StaffFactory(branch=branch)
        GroupFactory(branch=branch, teacher=teacher)

        report = get_teachers_report(_director(), _wide_filters())

        row = next(r for r in report["results"] if r["teacher_id"] == str(teacher.id))
        assert row["revenue_total"] == "0.00"
