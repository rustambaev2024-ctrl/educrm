"""T-008 / R-20: ученик не может сам себе выставить оценку или статус проверки.

Легитимный путь (сдача работы) обязан остаться открытым — проверяется явно.
"""
import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.courses.models import Course, Group, GroupMembership
from apps.grades.models import Grade
from apps.homework.models import Homework, HomeworkStatus
from apps.institutions.models import Branch
from apps.staff.models import Staff
from apps.students.models import Student

User = get_user_model()
pytestmark = pytest.mark.django_db


def _login(api_client, phone, password="secret123"):
    response = api_client.post(
        "/api/v1/auth/login/",
        {"phone": phone, "password": password},
        format="json",
    )
    assert response.status_code == 200, response.json()
    return response.json()["access"]


@pytest.fixture
def hw_env():
    branch = Branch.objects.create(name="Main", address="A", phone="+998901777001")
    teacher_user = User.objects.create_user(
        phone="+998909300001", full_name="Teacher", role="teacher", password="secret123"
    )
    teacher_staff = Staff.objects.create(user=teacher_user, branch=branch)
    student_user = User.objects.create_user(
        phone="+998909300002", full_name="Student", role="student", password="secret123"
    )
    student = Student.objects.create(user=student_user, branch=branch)
    other_student_user = User.objects.create_user(
        phone="+998909300003", full_name="Other", role="student", password="secret123"
    )
    other_student = Student.objects.create(user=other_student_user, branch=branch)

    course = Course.objects.create(name="Physics")
    group = Group.objects.create(
        name="PHY-01",
        course=course,
        branch=branch,
        teacher=teacher_staff,
        start_date=timezone.localdate(),
        monthly_price="400000.00",
        status="active",
        schedule=[],
    )
    GroupMembership.objects.create(group=group, student=student)
    GroupMembership.objects.create(group=group, student=other_student)

    homework = Homework.objects.create(
        title="HW", assign_type="group", group=group, created_by=teacher_user
    )
    hw_status = HomeworkStatus.objects.create(
        homework=homework, student=student, status="not_submitted"
    )
    other_status = HomeworkStatus.objects.create(
        homework=homework, student=other_student, status="not_submitted"
    )
    return {
        "student_user": student_user,
        "teacher_user": teacher_user,
        "status": hw_status,
        "other_status": other_status,
    }


def test_student_cannot_grade_himself(api_client, hw_env):
    access = _login(api_client, hw_env["student_user"].phone)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    response = api_client.patch(
        f"/api/v1/homeworks/submissions/{hw_env['status'].id}/",
        {"status": "checked", "grade": 10},
        format="json",
    )
    assert response.status_code == 403, response.json()
    body = response.json()
    assert set(body["detail"]) == {"uz", "ru"}

    hw_env["status"].refresh_from_db()
    assert hw_env["status"].grade is None
    assert hw_env["status"].status == "not_submitted"
    assert not Grade.objects.filter(homework_status=hw_env["status"]).exists()


def test_student_cannot_set_grade_alone(api_client, hw_env):
    access = _login(api_client, hw_env["student_user"].phone)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    response = api_client.patch(
        f"/api/v1/homeworks/submissions/{hw_env['status'].id}/",
        {"grade": 9},
        format="json",
    )
    assert response.status_code == 403
    hw_env["status"].refresh_from_db()
    assert hw_env["status"].grade is None


def test_student_cannot_write_teacher_comment(api_client, hw_env):
    access = _login(api_client, hw_env["student_user"].phone)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    response = api_client.patch(
        f"/api/v1/homeworks/submissions/{hw_env['status'].id}/",
        {"teacher_comment": "Excellent"},
        format="json",
    )
    assert response.status_code == 403
    hw_env["status"].refresh_from_db()
    assert hw_env["status"].teacher_comment in ("", None)


def test_student_cannot_touch_other_students_status(api_client, hw_env):
    access = _login(api_client, hw_env["student_user"].phone)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    response = api_client.patch(
        f"/api/v1/homeworks/submissions/{hw_env['other_status'].id}/",
        {"status": "submitted"},
        format="json",
    )
    assert response.status_code == 404


def test_student_can_still_submit_homework(api_client, hw_env):
    """Легитимный путь: ученик сдаёт работу — должен продолжать работать."""
    access = _login(api_client, hw_env["student_user"].phone)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    response = api_client.patch(
        f"/api/v1/homeworks/submissions/{hw_env['status'].id}/",
        {"status": "submitted", "answer_text": "Мой ответ"},
        format="json",
    )
    assert response.status_code == 200, response.json()
    hw_env["status"].refresh_from_db()
    assert hw_env["status"].status == "submitted"
    assert hw_env["status"].submitted_at is not None
    assert hw_env["status"].grade is None


def test_teacher_can_still_grade(api_client, hw_env):
    """Легитимный путь: учитель проверяет работу — должен продолжать работать."""
    access = _login(api_client, hw_env["teacher_user"].phone)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    response = api_client.patch(
        f"/api/v1/homeworks/submissions/{hw_env['status'].id}/",
        {"status": "checked", "grade": 9, "teacher_comment": "Good"},
        format="json",
    )
    assert response.status_code == 200, response.json()
    hw_env["status"].refresh_from_db()
    assert hw_env["status"].grade == 9
    assert Grade.objects.filter(homework_status=hw_env["status"]).exists()
