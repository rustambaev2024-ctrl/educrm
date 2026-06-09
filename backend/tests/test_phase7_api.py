from datetime import timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.courses.models import Course, Group, GroupMembership
from apps.finance.models import Payment, Wallet
from apps.grades.models import Grade
from apps.homework.models import Homework, HomeworkStatus
from apps.institutions.models import Branch, Room
from apps.lessons.models import Attendance, Lesson
from apps.staff.models import Staff
from apps.students.models import Certificate, Parent, ParentStudentLink, Student


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
def test_phase7_student_and_parent_mobile_endpoints(api_client):
    today = timezone.localdate()
    branch = Branch.objects.create(name="Main", address="A", phone="+998901040404")
    room = Room.objects.create(branch=branch, name="A-101", capacity=24)

    director = User.objects.create_user(
        phone="+998909300020",
        full_name="Director",
        role="director",
        password="secret123",
    )
    teacher_user = User.objects.create_user(
        phone="+998909300021",
        full_name="Teacher",
        role="teacher",
        password="secret123",
    )
    teacher = Staff.objects.create(user=teacher_user, branch=branch, salary_percent="40.00")

    student_user = User.objects.create_user(
        phone="+998909300022",
        full_name="Student",
        role="student",
        password="secret123",
    )
    student = Student.objects.create(
        user=student_user,
        branch=branch,
        status="active",
        wallet_balance=Decimal("350000.00"),
    )

    parent_user = User.objects.create_user(
        phone="+998909300023",
        full_name="Parent",
        role="parent",
        password="secret123",
    )
    parent = Parent.objects.create(user=parent_user)
    ParentStudentLink.objects.create(parent=parent, student=student)

    course = Course.objects.create(name="English", created_by=director)
    group = Group.objects.create(
        name="ENG-01",
        course=course,
        branch=branch,
        teacher=teacher,
        room=room,
        start_date=today - timedelta(days=15),
        monthly_price=Decimal("500000.00"),
        status="active",
        schedule=[{"day": today.weekday(), "start_time": "09:00", "end_time": "10:00"}],
    )
    GroupMembership.objects.create(group=group, student=student, enrolled_by=director)

    lesson = Lesson.objects.create(
        group=group,
        room=room,
        teacher=teacher,
        datetime=timezone.now() + timedelta(days=1),
        status="scheduled",
    )
    Attendance.objects.create(
        lesson=lesson,
        student=student,
        status="present",
        recorded_by=teacher_user,
    )

    wallet, _ = Wallet.objects.get_or_create(student=student, defaults={"balance": Decimal("350000.00")})
    wallet.balance = Decimal("350000.00"); wallet.save()
    Payment.objects.create(
        wallet=wallet,
        student=student,
        branch=branch,
        group=group,
        lesson=lesson,
        payment_type="top_up",
        amount=Decimal("350000.00"),
        balance_before=Decimal("0.00"),
        balance_after=Decimal("350000.00"),
        created_by=director,
    )

    homework = Homework.objects.create(
        title="Read chapter",
        assign_type="group",
        group=group,
        deadline=timezone.now() + timedelta(days=2),
        created_by=teacher_user,
    )
    HomeworkStatus.objects.create(homework=homework, student=student, status="submitted")

    Grade.objects.create(
        student=student,
        group=group,
        lesson=lesson,
        grade_type="lesson",
        score=88,
        graded_by=teacher_user,
    )
    Certificate.objects.create(student=student, course=course, issued_at=today, issued_by=director)

    student_access = _login(api_client, student_user.phone, "secret123")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {student_access}")

    student_paths = [
        "/api/v1/student/me/",
        "/api/v1/student/me/schedule/",
        "/api/v1/student/me/attendance/",
        "/api/v1/student/me/grades/",
        "/api/v1/student/me/homeworks/",
        "/api/v1/student/me/wallet/",
        "/api/v1/student/me/documents/",
    ]
    for path in student_paths:
        response = api_client.get(path)
        assert response.status_code == 200, f"{path} failed: {response.content!r}"

    parent_access = _login(api_client, parent_user.phone, "secret123")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {parent_access}")

    children_response = api_client.get("/api/v1/parent/me/children/")
    assert children_response.status_code == 200
    assert len(children_response.json()["children"]) >= 1

    another_student_user = User.objects.create_user(
        phone="+998909300024",
        full_name="Student Two",
        role="student",
        password="secret123",
    )
    another_student = Student.objects.create(
        user=another_student_user,
        branch=branch,
        status="active",
    )
    # Endpoint requires a 6-digit code, not student_id — create a ParentLinkCode
    from apps.students.models import ParentLinkCode
    from django.utils import timezone as tz
    import datetime
    link_code_obj = ParentLinkCode.objects.create(
        student=another_student,
        code="123456",
        is_used=False,
        expires_at=tz.now() + datetime.timedelta(hours=1),
    )
    link_response = api_client.post(
        "/api/v1/parent/me/children/link/",
        {"code": "123456"},
        format="json",
    )
    assert link_response.status_code == 201, link_response.json()
    assert link_response.json()["created"] is True
