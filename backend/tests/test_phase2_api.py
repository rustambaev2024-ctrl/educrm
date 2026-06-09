import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.courses.models import Group
from apps.institutions.models import Branch
from apps.lessons.models import Lesson
from apps.staff.models import Staff


User = get_user_model()
pytestmark = pytest.mark.django_db


def _login(api_client, phone, password):
    return api_client.post(
        "/api/v1/auth/login/",
        {"phone": phone, "password": password},
        format="json",
    )


@pytest.mark.django_db
def test_students_courses_groups_and_lessons_flow(api_client):
    branch = Branch.objects.create(name="Main", address="A", phone="+998901234567")
    director = User.objects.create_user(
        phone="+998904000001",
        full_name="Director",
        role="director",
        password="secret123",
    )
    director_staff = Staff.objects.create(user=director, branch=branch)

    teacher_user = User.objects.create_user(
        phone="+998904000002",
        full_name="Teacher",
        role="teacher",
        password="secret123",
    )
    teacher_staff = Staff.objects.create(user=teacher_user, branch=branch)

    login_response = _login(api_client, director.phone, "secret123")
    access = login_response.json()["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    student_response = api_client.post(
        "/api/v1/students/",
        {
            "full_name": "Student One",
            "phone": "+998905000001",
            "password": "secret123",
            "branch": str(branch.id),
            "status": "active",
        },
        format="json",
    )
    assert student_response.status_code == 201
    student_id = student_response.json()["id"]

    course_response = api_client.post(
        "/api/v1/courses/",
        {"name": "English", "description": "A1"},
        format="json",
    )
    assert course_response.status_code == 201
    course_id = course_response.json()["id"]

    group_response = api_client.post(
        "/api/v1/groups/",
        {
            "name": "ENG-A1-01",
            "course": course_id,
            "branch": str(branch.id),
            "teacher": str(teacher_staff.id),
            "capacity": 12,
            "start_date": "2026-04-01",
            "monthly_price": "500000.00",
            "status": "active",
            "schedule": [{"day": 0, "start_time": "09:00", "end_time": "10:30"}],
        },
        format="json",
    )
    assert group_response.status_code == 201
    group_id = group_response.json()["id"]

    add_student_response = api_client.post(
        f"/api/v1/groups/{group_id}/students/",
        {"student_id": student_id},
        format="json",
    )
    assert add_student_response.status_code == 201

    remove_student_response = api_client.delete(
        f"/api/v1/groups/{group_id}/students/{student_id}/",
    )
    assert remove_student_response.status_code == 200

    group = Group.objects.get(id=group_id)
    lesson = Lesson.objects.create(
        group=group,
        datetime=timezone.now(),
        teacher=director_staff,
    )

    substitute_response = api_client.patch(
        f"/api/v1/lessons/{lesson.id}/substitute/",
        {"teacher_id": str(teacher_staff.id)},
        format="json",
    )
    assert substitute_response.status_code == 200
    payload = substitute_response.json()
    assert payload["teacher"] == str(teacher_staff.id)
    assert payload["is_substitute"] is True
