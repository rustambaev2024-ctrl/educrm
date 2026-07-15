import pytest

from apps.chat.models import Message
from apps.chat.services import add_student_to_group_chat, remove_student_from_group_chat

from .factories import GroupFactory, GroupMembershipFactory, StudentFactory


@pytest.mark.django_db
def test_group_chat_system_messages_are_human_readable():
    group = GroupFactory()
    student = StudentFactory(branch=group.branch)
    GroupMembershipFactory(group=group, student=student)

    add_student_to_group_chat(group, student)
    remove_student_from_group_chat(group, student)

    texts = list(Message.objects.filter(message_type="system").order_by("created_at").values_list("text", flat=True))

    assert texts == [
        f"{student.user.full_name} добавлен(а) в группу",
        f"{student.user.full_name} удален(а) из группы",
    ]
    assert all("added to group" not in text and "removed from group" not in text for text in texts)
