import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from apps.institutions.models import Branch
from apps.courses.models import Course, Group
from apps.staff.models import Staff
from apps.lessons.models import Lesson


def test_healthcheck(api_client):
    response = api_client.get("/api/v1/health/")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.django_db
def test_teacher_checkin_flow(api_client):
    User = get_user_model()
    # Create required objects
    branch = Branch.objects.create(name="Main Branch", address="Tashkent", phone="+998901111111")
    director = User.objects.create_user(
        phone="+998901234567",
        full_name="Director User",
        role="director",
        password="password123"
    )
    teacher_user = User.objects.create_user(
        phone="+998907654321",
        full_name="Teacher User",
        role="teacher",
        password="password123"
    )
    teacher = Staff.objects.create(user=teacher_user, branch=branch)
    course = Course.objects.create(name="Maths", created_by=director)
    group = Group.objects.create(
        name="MATH-A",
        course=course,
        branch=branch,
        teacher=teacher,
        start_date=timezone.localdate(),
        monthly_price="500000.00",
        status="active"
    )
    lesson = Lesson.objects.create(
        group=group,
        datetime=timezone.now(),
        teacher=teacher,
        status="scheduled"
    )

    # Login as director
    response = api_client.post(
        "/api/v1/auth/login/",
        {"phone": "+998901234567", "password": "password123"},
        format="json",
    )
    assert response.status_code == 200
    token = response.json()["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    # 1. GET - check-in when it doesn't exist yet
    get_resp = api_client.get(f"/api/v1/lessons/{lesson.id}/teacher-checkin/")
    assert get_resp.status_code == 200
    assert get_resp.json() is None

    # 2. POST - mark check-in as late
    post_resp = api_client.post(
        f"/api/v1/lessons/{lesson.id}/teacher-checkin/",
        {
            "check_in_time": "09:15:00",
            "status": "late",
            "late_minutes": 15,
            "note": "Traffic delay"
        },
        format="json"
    )
    assert post_resp.status_code == 200
    assert post_resp.json()["status"] == "late"
    assert post_resp.json()["late_minutes"] == 15
    assert post_resp.json()["note"] == "Traffic delay"

    # 3. GET - verify values returned match
    get_resp2 = api_client.get(f"/api/v1/lessons/{lesson.id}/teacher-checkin/")
    assert get_resp2.status_code == 200
    assert get_resp2.json()["status"] == "late"
    assert get_resp2.json()["late_minutes"] == 15

    # 4. POST - update check-in to present
    post_resp2 = api_client.post(
        f"/api/v1/lessons/{lesson.id}/teacher-checkin/",
        {
            "check_in_time": "09:00:00",
            "status": "present",
            "note": "Resolved"
        },
        format="json"
    )
    assert post_resp2.status_code == 200
    assert post_resp2.json()["status"] == "present"
    assert post_resp2.json()["late_minutes"] is None
