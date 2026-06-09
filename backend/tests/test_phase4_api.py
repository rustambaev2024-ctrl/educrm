from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.courses.models import Course, Group, GroupMembership
from apps.grades.models import Grade
from apps.homework.models import HomeworkStatus
from apps.homework.tasks import mark_overdue_homework
from apps.institutions.models import Branch
from apps.lessons.models import Lesson
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
def test_homework_grade_exam_cycle(api_client):
    branch = Branch.objects.create(name="Main", address="A", phone="+998901999999")
    director_user = User.objects.create_user(
        phone="+998909100001",
        full_name="Director",
        role="director",
        password="secret123",
    )
    teacher_user = User.objects.create_user(
        phone="+998909100002",
        full_name="Teacher",
        role="teacher",
        password="secret123",
    )
    teacher_staff = Staff.objects.create(user=teacher_user, branch=branch)
    student_user = User.objects.create_user(
        phone="+998909100003",
        full_name="Student",
        role="student",
        password="secret123",
    )
    student = Student.objects.create(user=student_user, branch=branch)

    course = Course.objects.create(name="Biology", created_by=director_user)
    group = Group.objects.create(
        name="BIO-01",
        course=course,
        branch=branch,
        teacher=teacher_staff,
        start_date=timezone.localdate(),
        monthly_price="400000.00",
        status="active",
        schedule=[],
    )
    GroupMembership.objects.create(group=group, student=student, enrolled_by=director_user)
    lesson = Lesson.objects.create(group=group, datetime=timezone.now(), teacher=teacher_staff)

    teacher_access = _login(api_client, teacher_user.phone, "secret123")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {teacher_access}")

    create_hw = api_client.post(
        "/api/v1/homeworks/",
        {
            "title": "Chapter 1",
            "description": "Read and summarize",
            "assign_type": "group",
            "group": str(group.id),
            "lesson": str(lesson.id),
            "deadline": (timezone.now() + timedelta(days=1)).isoformat(),
        },
        format="json",
    )
    assert create_hw.status_code == 201
    homework_id = create_hw.json()["id"]

    statuses = HomeworkStatus.objects.filter(homework_id=homework_id)
    assert statuses.count() == 1
    status_id = statuses.first().id

    check_hw = api_client.patch(
        f"/api/v1/homeworks/{homework_id}/status/",
        {
            "status_id": str(status_id),
            "status": "checked",
            "grade": 88,
            "teacher_comment": "Good",
        },
        format="json",
    )
    assert check_hw.status_code == 200
    assert Grade.objects.filter(homework_status_id=status_id, grade_type="homework").exists()

    create_exam = api_client.post(
        "/api/v1/grades/exams/",
        {
            "group": str(group.id),
            "name": "Midterm",
            "date": str(timezone.localdate()),
            "max_score": 100,
        },
        format="json",
    )
    assert create_exam.status_code == 201
    exam_id = create_exam.json()["id"]

    add_result = api_client.post(
        f"/api/v1/grades/exams/{exam_id}/results/",
        {
            "exam": str(exam_id),
            "student": str(student.id),
            "score": 92,
            "pass_status": "passed",
            "comment": "Great",
        },
        format="json",
    )
    assert add_result.status_code == 201
    assert Grade.objects.filter(exam_id=exam_id, student=student, grade_type="exam").exists()

    avg = api_client.get(f"/api/v1/grades/student/{student.id}/average/")
    assert avg.status_code == 200
    assert avg.json()["average_score"] >= 90


@pytest.mark.django_db
def test_overdue_homework_task_marks_status(api_client):
    branch = Branch.objects.create(name="Main", address="A", phone="+998901888888")
    teacher_user = User.objects.create_user(
        phone="+998909200001",
        full_name="Teacher",
        role="teacher",
        password="secret123",
    )
    teacher_staff = Staff.objects.create(user=teacher_user, branch=branch)
    student_user = User.objects.create_user(
        phone="+998909200002",
        full_name="Student",
        role="student",
        password="secret123",
    )
    student = Student.objects.create(user=student_user, branch=branch)
    course = Course.objects.create(name="Math")
    group = Group.objects.create(
        name="MATH-02",
        course=course,
        branch=branch,
        teacher=teacher_staff,
        start_date=timezone.localdate(),
        monthly_price="300000.00",
        status="active",
        schedule=[],
    )
    GroupMembership.objects.create(group=group, student=student)
    homework = group.homeworks.create(
        title="Old HW",
        assign_type="group",
        deadline=timezone.now() - timedelta(days=2),
        created_by=teacher_user,
    )
    status = HomeworkStatus.objects.create(
        homework=homework,
        student=student,
        status="not_submitted",
    )

    mark_overdue_homework()
    status.refresh_from_db()
    assert status.status == "overdue"
