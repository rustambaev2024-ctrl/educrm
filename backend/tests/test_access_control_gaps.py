"""Регрессия на дыры доступа, найденные при проверке перед выдачей клиентам.

Каждый тест закрывает конкретную находку: раньше все три запроса проходили.
"""
import pytest
from django.contrib.auth import get_user_model

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
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['access']}")
    return response


def _make_student(phone="+998903333331"):
    branch = Branch.objects.create(name="A", address="A", phone="1")
    user = User.objects.create_user(
        phone=phone,
        full_name="Student One",
        role="student",
        password="secret123",
    )
    student = Student.objects.create(user=user, branch=branch)
    return branch, user, student


def test_student_cannot_read_transfer_history(api_client):
    """GET истории переводов не проверял роль — ученик видел переводы всей
    организации: имена, группы, филиалы, причины."""
    _make_student()
    _login(api_client, "+998903333331")

    response = api_client.get("/api/v1/transfers/")
    assert response.status_code == 403


def test_login_is_throttled_per_phone(api_client):
    """Вход не был ограничен вообще — пароль к известному номеру подбирался
    без лимита. Лимит по телефону, а не по IP: школа сидит за одним адресом."""
    from django.core.cache import cache

    cache.clear()
    _make_student(phone="+998903333333")

    statuses = [
        api_client.post(
            "/api/v1/auth/login/",
            {"phone": "+998903333333", "password": "wrong"},
            format="json",
        ).status_code
        for _ in range(12)
    ]
    assert 429 in statuses, statuses
    cache.clear()


def test_student_cannot_mark_teacher_checkin(api_client):
    """Отметка о приходе учителя влияет на зарплату — ученик её ставить не
    должен, даже для урока, который ему виден."""
    from datetime import timedelta

    from django.utils import timezone

    from apps.lessons.models import Lesson
    from tests.factories import GroupFactory, StaffFactory

    branch, _, student = _make_student(phone="+998903333332")
    teacher = StaffFactory(branch=branch)
    group = GroupFactory(teacher=teacher, branch=branch)
    lesson = Lesson.objects.create(
        group=group,
        teacher=teacher,
        datetime=timezone.now() + timedelta(days=1),
        status="scheduled",
    )

    _login(api_client, "+998903333332")
    response = api_client.post(
        f"/api/v1/lessons/{lesson.id}/teacher-checkin/",
        {"status": "present"},
        format="json",
    )
    assert response.status_code == 403
