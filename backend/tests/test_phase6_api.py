from datetime import timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.courses.models import Course, Group, GroupMembership
from apps.finance.models import Payment, Wallet
from apps.institutions.models import Branch, Room
from apps.lessons.models import Attendance, Lesson
from apps.staff.models import Staff
from apps.students.models import Student


User = get_user_model()
pytestmark = pytest.mark.django_db


def _login(api_client, phone, password):
    response = api_client.post(
        "/api/v1/auth/login/",
        {"phone": phone, "password": password},
        format="json",
    )
    assert response.status_code == 200
    return response.json()["access"]


@pytest.mark.django_db
def test_phase6_analytics_salary_and_exports(api_client):
    today = timezone.localdate()
    date_from = str(today - timedelta(days=7))
    date_to = str(today + timedelta(days=1))

    branch = Branch.objects.create(name="Main branch", address="A", phone="+998901030303")
    room = Room.objects.create(branch=branch, name="R-101", capacity=20)

    director = User.objects.create_user(
        phone="+998909300010",
        full_name="Director",
        role="director",
        password="secret123",
    )
    teacher_user = User.objects.create_user(
        phone="+998909300011",
        full_name="Teacher",
        role="teacher",
        password="secret123",
    )
    teacher = Staff.objects.create(
        user=teacher_user,
        branch=branch,
        salary_percent=Decimal("35.00"),
    )

    student_user = User.objects.create_user(
        phone="+998909300012",
        full_name="Student One",
        role="student",
        password="secret123",
    )
    debtor_user = User.objects.create_user(
        phone="+998909300013",
        full_name="Student Debtor",
        role="student",
        password="secret123",
    )

    student = Student.objects.create(
        user=student_user,
        branch=branch,
        status="active",
        wallet_balance=Decimal("500000.00"),
    )
    debtor = Student.objects.create(
        user=debtor_user,
        branch=branch,
        status="debtor",
        wallet_balance=Decimal("-100000.00"),
    )

    course = Course.objects.create(name="Biology", created_by=director)
    group = Group.objects.create(
        name="BIO-01",
        course=course,
        branch=branch,
        teacher=teacher,
        room=room,
        start_date=today,
        monthly_price=Decimal("400000.00"),
        status="active",
        schedule=[],
    )
    GroupMembership.objects.create(group=group, student=student, enrolled_by=director)
    GroupMembership.objects.create(group=group, student=debtor, enrolled_by=director)

    lesson = Lesson.objects.create(
        group=group,
        room=room,
        teacher=teacher,
        datetime=timezone.now(),
        status="conducted",
    )
    Attendance.objects.create(
        lesson=lesson,
        student=student,
        status="present",
        recorded_by=teacher_user,
    )
    Attendance.objects.create(
        lesson=lesson,
        student=debtor,
        status="absent",
        recorded_by=teacher_user,
    )

    wallet_student = Wallet.objects.create(student=student, balance=Decimal("500000.00"))
    wallet_debtor = Wallet.objects.create(student=debtor, balance=Decimal("-100000.00"))
    Payment.objects.create(
        wallet=wallet_student,
        student=student,
        branch=branch,
        group=group,
        payment_type="top_up",
        amount=Decimal("400000.00"),
        balance_before=Decimal("100000.00"),
        balance_after=Decimal("500000.00"),
        created_by=director,
    )
    Payment.objects.create(
        wallet=wallet_debtor,
        student=debtor,
        branch=branch,
        group=group,
        payment_type="top_up",
        amount=Decimal("150000.00"),
        balance_before=Decimal("-250000.00"),
        balance_after=Decimal("-100000.00"),
        created_by=director,
    )
    AuditLog.objects.create(
        user=director,
        user_role="director",
        action="update",
        entity_type="Student",
        entity_id=str(student.id),
    )

    access = _login(api_client, director.phone, "secret123")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    analytics_paths = [
        "/api/v1/analytics/overview/",
        "/api/v1/analytics/attendance/",
        "/api/v1/analytics/revenue/",
        "/api/v1/analytics/teachers/",
        "/api/v1/analytics/rooms/",
        "/api/v1/analytics/conversion/",
        "/api/v1/analytics/debtors/",
    ]
    for path in analytics_paths:
        response = api_client.get(
            path,
            {"date_from": date_from, "date_to": date_to, "branch_id": str(branch.id)},
        )
        assert response.status_code == 200, f"{path} failed: {response.content!r}"

    salary = api_client.get(
        "/api/v1/salary/calculate/",
        {
            "teacher_id": str(teacher.id),
            "date_from": date_from,
            "date_to": date_to,
            "salary_percent": "40.00",
        },
    )
    assert salary.status_code == 200
    assert Decimal(salary.json()["calculated_salary"]) > Decimal("0")

    excel = api_client.post(
        "/api/v1/export/excel/",
        {"report_type": "finance", "date_from": date_from, "date_to": date_to},
        format="json",
    )
    assert excel.status_code == 200
    assert (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        in excel["Content-Type"]
    )
    assert len(excel.content) > 100

    pdf = api_client.post(
        "/api/v1/export/pdf/",
        {"report_type": "attendance", "date_from": date_from, "date_to": date_to},
        format="json",
    )
    assert pdf.status_code == 200
    assert "application/pdf" in pdf["Content-Type"]
    assert len(pdf.content) > 20
