import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone

from apps.courses.models import Course, Group, GroupMembership
from apps.finance.models import Payment
from apps.institutions.models import Branch
from apps.lessons.models import Attendance, Lesson
from apps.staff.models import Staff
from apps.students.models import Student


User = get_user_model()
pytestmark = pytest.mark.skipif(
    not hasattr(connection, "set_schema"),
    reason="Phase 3 integration tests require django-tenants PostgreSQL backend.",
)


def _login(api_client, phone, password):
    response = api_client.post(
        "/api/v1/auth/login/",
        {"phone": phone, "password": password},
        format="json",
    )
    assert response.status_code == 200
    return response.json()["access"]


@pytest.mark.django_db
def test_attendance_bulk_creates_charge_payment_and_updates_status(api_client):
    branch = Branch.objects.create(name="Main", address="A", phone="+998901111111")
    director_user = User.objects.create_user(
        phone="+998908000001",
        full_name="Director",
        role="director",
        password="secret123",
    )
    teacher_user = User.objects.create_user(
        phone="+998908000002",
        full_name="Teacher",
        role="teacher",
        password="secret123",
    )
    teacher_staff = Staff.objects.create(user=teacher_user, branch=branch)
    student_user = User.objects.create_user(
        phone="+998908000003",
        full_name="Student",
        role="student",
        password="secret123",
    )
    student = Student.objects.create(user=student_user, branch=branch)

    course = Course.objects.create(name="Math", created_by=director_user)
    weekday = timezone.localdate().weekday()
    group = Group.objects.create(
        name="MATH-01",
        course=course,
        branch=branch,
        teacher=teacher_staff,
        start_date=timezone.localdate(),
        monthly_price="400000.00",
        status="active",
        schedule=[{"day": weekday, "start_time": "09:00", "end_time": "10:30"}],
    )
    GroupMembership.objects.create(group=group, student=student, enrolled_by=director_user)
    lesson = Lesson.objects.create(
        group=group,
        datetime=timezone.now(),
        teacher=teacher_staff,
        status="scheduled",
    )

    teacher_access = _login(api_client, teacher_user.phone, "secret123")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {teacher_access}")
    response = api_client.post(
        f"/api/v1/lessons/{lesson.id}/attendance/",
        {"records": [{"student_id": str(student.id), "status": "present"}]},
        format="json",
    )
    assert response.status_code == 200

    attendance = Attendance.objects.get(lesson=lesson, student=student)
    assert attendance.is_charged is True
    payment = Payment.objects.get(student=student, lesson=lesson, payment_type="charge")
    assert payment.amount > 0

    student.refresh_from_db()
    assert student.wallet_balance < 0
    assert student.status == "debtor"

    lesson.refresh_from_db()
    assert lesson.status == "conducted"


@pytest.mark.django_db
def test_payments_endpoints_and_debtors_list(api_client):
    branch = Branch.objects.create(name="Branch A", address="A", phone="+998901222222")
    admin_user = User.objects.create_user(
        phone="+998908000004",
        full_name="Admin",
        role="admin",
        password="secret123",
    )
    Staff.objects.create(user=admin_user, branch=branch)

    student_user = User.objects.create_user(
        phone="+998908000005",
        full_name="Student 2",
        role="student",
        password="secret123",
    )
    student = Student.objects.create(user=student_user, branch=branch)

    admin_access = _login(api_client, admin_user.phone, "secret123")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {admin_access}")

    create_payment = api_client.post(
        "/api/v1/payments/",
        {
            "student_id": str(student.id),
            "payment_type": "top_up",
            "amount": "50000.00",
            "comment": "Initial payment",
        },
        format="json",
    )
    assert create_payment.status_code == 201

    student_payments = api_client.get(f"/api/v1/students/{student.id}/payments/")
    assert student_payments.status_code == 200
    assert len(student_payments.json()["payments"]) >= 1

    debtors = api_client.get(f"/api/v1/branches/{branch.id}/debtors/")
    assert debtors.status_code == 200
    assert "results" in debtors.json()
