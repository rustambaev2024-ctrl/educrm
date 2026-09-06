import pytest
from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone

from tests.factories import (
    BranchFactory, CourseFactory, GroupFactory, GroupMembershipFactory,
    LessonFactory, StaffFactory, StudentFactory, UserFactory,
)

pytestmark = pytest.mark.django_db


def _director():
    return UserFactory(role="director")


def _wide_filters(branch_id=None):
    from apps.reports.services import ReportFilters
    return ReportFilters(date_from=date(2000, 1, 1), date_to=date(2100, 1, 1), branch_id=branch_id)


def _filters(date_from, date_to, branch_id=None):
    from apps.reports.services import ReportFilters
    return ReportFilters(date_from=date_from, date_to=date_to, branch_id=branch_id)


class TestAttendanceTrend:
    def test_by_day_uses_same_rule_as_overall_rate(self):
        from apps.lessons.models import Attendance
        from apps.reports.services import get_attendance_report

        branch = BranchFactory()
        group = GroupFactory(branch=branch)
        lesson_day = timezone.now().replace(hour=10, minute=0, second=0, microsecond=0)
        lesson = LessonFactory(group=group, datetime=lesson_day)
        s1 = StudentFactory(branch=branch)
        s2 = StudentFactory(branch=branch)
        s3 = StudentFactory(branch=branch)
        Attendance.objects.create(lesson=lesson, student=s1, status="present")
        Attendance.objects.create(lesson=lesson, student=s2, status="absent")
        # excused не входит ни в числитель, ни в знаменатель — как и в overall_rate
        Attendance.objects.create(lesson=lesson, student=s3, status="excused")

        report = get_attendance_report(_director(), _wide_filters())

        assert report["overall_rate"] == "50.00"
        day_row = next(r for r in report["by_day"] if r["day"] == str(lesson_day.date()))
        assert day_row["attendance_rate"] == "50.00"
        assert day_row["present_records"] == 1
        assert day_row["total_records"] == 2

    def test_by_day_empty_when_no_attendance(self):
        from apps.reports.services import get_attendance_report

        BranchFactory()

        report = get_attendance_report(_director(), _wide_filters())

        assert report["by_day"] == []
