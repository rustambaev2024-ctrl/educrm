from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.chat.models import Chat, ChatParticipant, Message
from apps.courses.models import Course, Group, GroupMembership
from apps.institutions.models import Branch
from apps.lessons.models import Lesson
from apps.notifications.models import Notification
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
def test_group_chat_created_and_system_messages_on_membership_changes(api_client):
    branch = Branch.objects.create(name="Main", address="A", phone="+998901010101")
    director_user = User.objects.create_user(
        phone="+998909300001",
        full_name="Director",
        role="director",
        password="secret123",
    )
    teacher_user = User.objects.create_user(
        phone="+998909300002",
        full_name="Teacher",
        role="teacher",
        password="secret123",
    )
    teacher_staff = Staff.objects.create(user=teacher_user, branch=branch)
    student_user = User.objects.create_user(
        phone="+998909300003",
        full_name="Student",
        role="student",
        password="secret123",
    )
    student = Student.objects.create(user=student_user, branch=branch)
    course = Course.objects.create(name="Physics", created_by=director_user)

    access = _login(api_client, director_user.phone, "secret123")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    create_group = api_client.post(
        "/api/v1/groups/",
        {
            "name": "PHY-01",
            "course": str(course.id),
            "branch": str(branch.id),
            "teacher": str(teacher_staff.id),
            "start_date": str(timezone.localdate()),
            "monthly_price": "450000.00",
            "status": "active",
            "schedule": [],
        },
        format="json",
    )
    assert create_group.status_code == 201
    group_id = create_group.json()["id"]

    chat = Chat.objects.get(group_id=group_id)
    assert chat.chat_type == "group_chat"
    assert ChatParticipant.objects.filter(chat=chat, user=teacher_user).exists()

    add_student = api_client.post(
        f"/api/v1/groups/{group_id}/students/",
        {"student_id": str(student.id)},
        format="json",
    )
    assert add_student.status_code == 201
    assert ChatParticipant.objects.filter(
        chat=chat,
        user=student_user,
        left_at__isnull=True,
    ).exists()
    assert Message.objects.filter(chat=chat, message_type="system").exists()

    remove_student = api_client.delete(f"/api/v1/groups/{group_id}/students/{student.id}/")
    assert remove_student.status_code == 200
    assert ChatParticipant.objects.filter(
        chat=chat,
        user=student_user,
        left_at__isnull=False,
    ).exists()


@pytest.mark.django_db
def test_chat_rest_and_notifications_endpoints(api_client):
    branch = Branch.objects.create(name="Main", address="A", phone="+998901020202")
    teacher_user = User.objects.create_user(
        phone="+998909300004",
        full_name="Teacher",
        role="teacher",
        password="secret123",
    )
    teacher_staff = Staff.objects.create(user=teacher_user, branch=branch)
    student_user = User.objects.create_user(
        phone="+998909300005",
        full_name="Student",
        role="student",
        password="secret123",
    )
    student = Student.objects.create(user=student_user, branch=branch)
    course = Course.objects.create(name="Chemistry")
    group = Group.objects.create(
        name="CHEM-01",
        course=course,
        branch=branch,
        teacher=teacher_staff,
        start_date=timezone.localdate(),
        monthly_price="400000.00",
        status="active",
        schedule=[],
    )
    GroupMembership.objects.create(group=group, student=student)
    chat = Chat.objects.get(group=group)
    ChatParticipant.objects.get_or_create(chat=chat, user=student_user)

    access = _login(api_client, teacher_user.phone, "secret123")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    chat_list = api_client.get("/api/v1/chats/")
    assert chat_list.status_code == 200
    assert len(chat_list.json()) >= 1

    post_message = api_client.post(
        f"/api/v1/chats/{chat.id}/messages/",
        {"text": "Hello class", "message_type": "text"},
        format="json",
    )
    assert post_message.status_code == 201

    messages = api_client.get(f"/api/v1/chats/{chat.id}/messages/")
    assert messages.status_code == 200
    assert "results" in messages.json()

    lesson = Lesson.objects.create(
        group=group,
        datetime=timezone.now() + timedelta(days=1),
        teacher=teacher_staff,
        status="scheduled",
    )
    # Cancel requires IsBranchAdmin role — use force_authenticate with director
    director_user = User.objects.create_user(
        phone="+998909300099",
        full_name="Director",
        role="director",
        password="secret123",
    )
    api_client.force_authenticate(user=director_user)
    cancel_response = api_client.patch(
        f"/api/v1/lessons/{lesson.id}/",
        {"status": "cancelled", "cancel_reason": "Teacher unavailable"},
        format="json",
    )
    assert cancel_response.status_code == 200
    # Restore teacher credentials
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    create_homework = api_client.post(
        "/api/v1/homeworks/",
        {
            "title": "Read chapter 2",
            "assign_type": "group",
            "group": str(group.id),
            "deadline": (timezone.now() + timedelta(days=2)).isoformat(),
        },
        format="json",
    )
    assert create_homework.status_code == 201
    assert Notification.objects.filter(notification_type="new_homework").exists()

    notifications = api_client.get("/api/v1/notifications/")
    assert notifications.status_code == 200

    read_all = api_client.patch("/api/v1/notifications/read-all/")
    assert read_all.status_code == 200
