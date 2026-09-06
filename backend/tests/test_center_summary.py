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


class TestTeachersReportBranchLeak:
    def test_attendance_counts_do_not_leak_across_branches(self):
        from apps.lessons.models import Attendance
        from apps.reports.services import get_teachers_report

        own_branch = BranchFactory()
        other_branch = BranchFactory()
        branch_admin_user = UserFactory(role="branch_admin")
        teacher = StaffFactory(user=UserFactory(role="teacher"), branch=own_branch)
        StaffFactory(user=branch_admin_user, branch=own_branch)

        # Группа того же учителя, но в ЧУЖОМ филиале, с посещаемостью
        other_group = GroupFactory(branch=other_branch, teacher=teacher)
        other_lesson = LessonFactory(group=other_group, teacher=teacher, datetime=timezone.now())
        student = StudentFactory(branch=other_branch)
        Attendance.objects.create(lesson=other_lesson, student=student, status="present")

        report = get_teachers_report(branch_admin_user, _wide_filters())

        row = next((r for r in report["results"] if r["teacher_id"] == str(teacher.id)), None)
        assert row is not None, "учитель своего филиала должен быть в отчёте"
        assert row["present_count"] == 0, "посещаемость чужого филиала не должна течь в цифры"
        assert row["absent_count"] == 0


class TestEnrollmentTrend:
    def test_new_students_counted_in_registration_month(self):
        from apps.reports.services import get_enrollment_trend
        from apps.students.models import Student

        branch = BranchFactory()
        student = StudentFactory(branch=branch)
        # registered_at — auto_now_add, поэтому для детерминированного месяца
        # переписываем его напрямую через queryset.update (обходит auto_now_add)
        moment = timezone.now().replace(year=2026, month=3, day=15)
        Student.objects.filter(id=student.id).update(registered_at=moment)

        report = get_enrollment_trend(_director(), _filters(date(2026, 1, 1), date(2026, 12, 31)))

        row = next(r for r in report["results"] if r["month"] == "2026-03")
        assert row["enrolled"] == 1

    def test_transfer_between_groups_is_not_churn(self):
        from apps.reports.services import get_enrollment_trend

        branch = BranchFactory()
        group_a = GroupFactory(branch=branch)
        group_b = GroupFactory(branch=branch)
        student = StudentFactory(branch=branch)
        left_moment = timezone.now().replace(year=2026, month=3, day=10)
        # Ушёл из A, но остался в B — это перевод, не отток.
        GroupMembershipFactory(group=group_a, student=student, left_at=left_moment)
        GroupMembershipFactory(group=group_b, student=student, left_at=None)

        report = get_enrollment_trend(_director(), _filters(date(2026, 1, 1), date(2026, 12, 31)))

        row = next(r for r in report["results"] if r["month"] == "2026-03")
        assert row["churned"] == 0

    def test_student_leaving_last_group_counts_as_churn(self):
        from apps.reports.services import get_enrollment_trend

        branch = BranchFactory()
        group = GroupFactory(branch=branch)
        student = StudentFactory(branch=branch)
        left_moment = timezone.now().replace(year=2026, month=4, day=20)
        GroupMembershipFactory(group=group, student=student, left_at=left_moment)

        report = get_enrollment_trend(_director(), _filters(date(2026, 1, 1), date(2026, 12, 31)))

        row = next(r for r in report["results"] if r["month"] == "2026-04")
        assert row["churned"] == 1

    def test_months_without_events_are_present_as_zeros(self):
        from apps.reports.services import get_enrollment_trend

        BranchFactory()

        report = get_enrollment_trend(_director(), _filters(date(2026, 1, 1), date(2026, 3, 31)))

        months = [r["month"] for r in report["results"]]
        assert months == ["2026-01", "2026-02", "2026-03"]
        assert all(r["enrolled"] == 0 and r["churned"] == 0 for r in report["results"])


class TestOccupancyTrend:
    def test_membership_open_at_month_end_counts(self):
        from apps.reports.services import get_occupancy_trend

        branch = BranchFactory()
        group = GroupFactory(branch=branch, status="active", capacity=10)
        student = StudentFactory(branch=branch)
        from apps.courses.models import GroupMembership
        membership = GroupMembershipFactory(group=group, student=student, left_at=None)
        GroupMembership.objects.filter(id=membership.id).update(
            enrolled_at=timezone.now().replace(year=2026, month=2, day=10)
        )

        report = get_occupancy_trend(_director(), _filters(date(2026, 1, 1), date(2026, 3, 31)))

        by_month = {r["month"]: r for r in report["results"]}
        assert by_month["2026-01"]["occupied"] == 0, "до вступления место не занято"
        assert by_month["2026-02"]["occupied"] == 1
        assert by_month["2026-03"]["occupied"] == 1
        assert by_month["2026-02"]["capacity"] == 10
        assert by_month["2026-02"]["occupancy_percent"] == "10.00"

    def test_membership_closed_before_month_end_does_not_count(self):
        from apps.reports.services import get_occupancy_trend
        from apps.courses.models import GroupMembership

        branch = BranchFactory()
        group = GroupFactory(branch=branch, status="active", capacity=5)
        student = StudentFactory(branch=branch)
        membership = GroupMembershipFactory(group=group, student=student)
        GroupMembership.objects.filter(id=membership.id).update(
            enrolled_at=timezone.now().replace(year=2026, month=1, day=5),
            left_at=timezone.now().replace(year=2026, month=2, day=3),
        )

        report = get_occupancy_trend(_director(), _filters(date(2026, 1, 1), date(2026, 3, 31)))

        by_month = {r["month"]: r for r in report["results"]}
        assert by_month["2026-01"]["occupied"] == 1
        assert by_month["2026-02"]["occupied"] == 0
        assert by_month["2026-03"]["occupied"] == 0

    def test_zero_capacity_does_not_divide_by_zero(self):
        from apps.reports.services import get_occupancy_trend

        BranchFactory()

        report = get_occupancy_trend(_director(), _filters(date(2026, 1, 1), date(2026, 1, 31)))

        assert report["results"][0]["capacity"] == 0
        assert report["results"][0]["occupancy_percent"] == "0.00"


class TestCenterSummaryBranchScoping:
    def test_enrollment_trend_excludes_other_branch(self):
        from apps.reports.services import get_enrollment_trend
        from apps.students.models import Student

        own_branch = BranchFactory()
        other_branch = BranchFactory()
        branch_admin_user = UserFactory(role="branch_admin")
        StaffFactory(user=branch_admin_user, branch=own_branch)

        student = StudentFactory(branch=other_branch)
        Student.objects.filter(id=student.id).update(
            registered_at=timezone.now().replace(year=2026, month=5, day=1)
        )

        report = get_enrollment_trend(branch_admin_user, _filters(date(2026, 1, 1), date(2026, 12, 31)))

        assert report["total_enrolled"] == 0

    def test_occupancy_trend_excludes_other_branch(self):
        from apps.reports.services import get_occupancy_trend

        own_branch = BranchFactory()
        other_branch = BranchFactory()
        branch_admin_user = UserFactory(role="branch_admin")
        StaffFactory(user=branch_admin_user, branch=own_branch)

        group = GroupFactory(branch=other_branch, status="active", capacity=20)
        GroupMembershipFactory(group=group, student=StudentFactory(branch=other_branch), left_at=None)

        report = get_occupancy_trend(branch_admin_user, _filters(date(2026, 1, 1), date(2026, 1, 31)))

        assert report["capacity"] == 0
        assert report["results"][0]["occupied"] == 0

    def test_attendance_by_day_excludes_other_branch(self):
        from apps.lessons.models import Attendance
        from apps.reports.services import get_attendance_report

        own_branch = BranchFactory()
        other_branch = BranchFactory()
        branch_admin_user = UserFactory(role="branch_admin")
        StaffFactory(user=branch_admin_user, branch=own_branch)

        group = GroupFactory(branch=other_branch)
        lesson = LessonFactory(group=group, datetime=timezone.now())
        Attendance.objects.create(lesson=lesson, student=StudentFactory(branch=other_branch), status="present")

        report = get_attendance_report(branch_admin_user, _wide_filters())

        assert report["by_day"] == []


class TestCenterSummaryEndpoints:
    def test_enrollment_trend_endpoint(self, api_client):
        api_client.force_authenticate(user=_director())

        response = api_client.get("/api/v1/analytics/enrollment-trend/")

        assert response.status_code == 200, response.content
        assert "results" in response.json()

    def test_occupancy_trend_endpoint(self, api_client):
        api_client.force_authenticate(user=_director())

        response = api_client.get("/api/v1/analytics/occupancy-trend/")

        assert response.status_code == 200, response.content
        assert "results" in response.json()

    def test_attendance_endpoint_includes_by_day(self, api_client):
        api_client.force_authenticate(user=_director())

        response = api_client.get("/api/v1/analytics/attendance/")

        assert response.status_code == 200, response.content
        assert "by_day" in response.json()


class TestCenterSummaryExport:
    def test_export_excel_center_summary(self, api_client):
        api_client.force_authenticate(user=_director())

        response = api_client.post(
            "/api/v1/export/excel/", {"report_type": "center_summary"}, format="json"
        )

        assert response.status_code == 200, response.content
        assert response["Content-Type"] == (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

    def test_export_pdf_center_summary(self, api_client):
        api_client.force_authenticate(user=_director())

        response = api_client.post(
            "/api/v1/export/pdf/", {"report_type": "center_summary"}, format="json"
        )

        assert response.status_code == 200, response.content

    def test_export_payload_is_center_summary_not_audit_fallback(self):
        # Ветка-заглушка в _build_export_payload отдаёт журнал аудита для любого
        # незнакомого типа, поэтому HTTP-тесты выше зеленеют и без реализации.
        # Этот тест проверяет сам payload — без него ветка center_summary
        # неотличима от fallback.
        from apps.reports.views import _build_export_payload

        report_type, data = _build_export_payload(
            _director(), {"report_type": "center_summary"}
        )

        assert report_type == "center_summary"
        assert "logs" not in data, "должен быть отчёт по центру, а не журнал аудита"
        for key in (
            "students_total",
            "attendance_overall_rate",
            "total_enrolled",
            "total_churned",
            "capacity",
            "attendance_by_day",
            "enrollment_by_month",
            "occupancy_by_month",
        ):
            assert key in data, key
