from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.utils import timezone

from .models import Chat, ChatParticipant, Message, MessageStatus


def serialize_message(message: Message) -> dict:
    sender = message.sender
    return {
        "id": str(message.id),
        "chat_id": str(message.chat_id),
        "sender": (
            {
                "id": str(sender.id),
                "full_name": sender.full_name,
                "role": sender.role,
                "photo": sender.photo.url if sender.photo else None,
            }
            if sender
            else None
        ),
        "message_type": message.message_type,
        "text": message.text,
        "file": message.file.url if message.file else None,
        "reply_to_id": str(message.reply_to_id) if message.reply_to_id else None,
        "is_edited": message.is_edited,
        "is_deleted": message.is_deleted,
        "created_at": message.created_at.isoformat(),
        "edited_at": message.edited_at.isoformat() if message.edited_at else None,
    }


def broadcast_chat_event(chat_id, event_type: str, payload: dict):
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    async_to_sync(channel_layer.group_send)(
        f"chat_{chat_id}",
        {"type": event_type, **payload},
    )


def create_group_chat(group) -> Chat:
    chat, _ = Chat.objects.get_or_create(
        group=group,
        defaults={
            "chat_type": "group_chat",
            "name": group.name,
        },
    )
    if group.teacher and group.teacher.user:
        ChatParticipant.objects.get_or_create(
            chat=chat,
            user=group.teacher.user,
            defaults={"role": "admin"},
        )
    return chat


def send_system_message(chat: Chat, text: str) -> Message:
    message = Message.objects.create(
        chat=chat,
        sender=None,
        message_type="system",
        text=text,
    )
    _create_message_statuses(message)
    broadcast_chat_event(chat.id, "message.new", {"message": serialize_message(message)})
    return message


def add_student_to_group_chat(group, student):
    chat = create_group_chat(group)
    participant, created = ChatParticipant.objects.get_or_create(
        chat=chat,
        user=student.user,
        defaults={"role": "member"},
    )
    if not created and participant.left_at is not None:
        participant.left_at = None
        participant.save(update_fields=["left_at"])
    send_system_message(chat, f"{student.user.full_name} добавлен(а) в группу")


def remove_student_from_group_chat(group, student):
    chat = create_group_chat(group)
    participant = ChatParticipant.objects.filter(chat=chat, user=student.user).first()
    if participant and participant.left_at is None:
        participant.left_at = timezone.now()
        participant.save(update_fields=["left_at"])
    send_system_message(chat, f"{student.user.full_name} удален(а) из группы")


def get_or_create_direct_chat(user_a, user_b, chat_type: str) -> Chat:
    chat = (
        Chat.objects.filter(chat_type=chat_type, participants__user=user_a)
        .filter(participants__user=user_b)
        .distinct()
        .first()
    )
    if chat:
        return chat

    with transaction.atomic():
        chat = Chat.objects.create(chat_type=chat_type, name="")
        ChatParticipant.objects.create(chat=chat, user=user_a, role="member")
        ChatParticipant.objects.create(chat=chat, user=user_b, role="member")
    return chat


def _create_message_statuses(message: Message):
    participants = message.chat.participants.filter(left_at__isnull=True).select_related("user")
    statuses = []
    for participant in participants:
        is_read = message.sender_id == participant.user_id
        statuses.append(
            MessageStatus(
                message=message,
                user_id=participant.user_id,
                is_read=is_read,
                read_at=timezone.now() if is_read else None,
            )
        )
    MessageStatus.objects.bulk_create(statuses, ignore_conflicts=True)


def create_message(
    chat: Chat,
    sender,
    *,
    text="",
    message_type="text",
    reply_to_id=None,
    file=None,
) -> Message:
    message = Message.objects.create(
        chat=chat,
        sender=sender,
        message_type=message_type,
        text=text,
        reply_to_id=reply_to_id,
        file=file,
    )
    _create_message_statuses(message)
    broadcast_chat_event(chat.id, "message.new", {"message": serialize_message(message)})
    return message


def edit_message(message: Message, new_text: str):
    message.text = new_text
    message.is_edited = True
    message.edited_at = timezone.now()
    message.save(update_fields=["text", "is_edited", "edited_at"])
    broadcast_chat_event(message.chat_id, "message.edit", {"message": serialize_message(message)})
    return message


def delete_message(message: Message):
    message.is_deleted = True
    message.save(update_fields=["is_deleted"])
    broadcast_chat_event(
        message.chat_id,
        "message.delete",
        {"message_id": str(message.id), "chat_id": str(message.chat_id)},
    )
    return message


def mark_chat_as_read(chat: Chat, user):
    now = timezone.now()
    MessageStatus.objects.filter(
        message__chat=chat,
        user=user,
        is_read=False,
    ).update(is_read=True, read_at=now)
    ChatParticipant.objects.filter(chat=chat, user=user).update(last_read_at=now)
    broadcast_chat_event(
        chat.id,
        "message.read",
        {"chat_id": str(chat.id), "user_id": str(user.id), "read_at": now.isoformat()},
    )


def chat_scope(chat: Chat) -> str:
    if chat.chat_type == "group_chat":
        return "group"
    if chat.chat_type in ("system_notifications", "director_staff"):
        return "broadcast"
    return "direct"


def chat_title_for_user(chat: Chat, user) -> str:
    if chat.name:
        return chat.name
    if chat.chat_type == "group_chat" and chat.group_id:
        return chat.group.name
    other = (
        chat.participants.filter(left_at__isnull=True)
        .exclude(user=user)
        .select_related("user")
        .first()
    )
    if other:
        return other.user.full_name
    return "Saved messages"


def serialize_chat(chat: Chat, user) -> dict:
    last_message = chat.messages.select_related("sender").order_by("-created_at").first()
    participants = chat.participants.filter(left_at__isnull=True).select_related("user")
    participant_payload = [
        {
            "id": str(item.user_id),
            "full_name": item.user.full_name,
            "role": item.user.role,
            "photo": item.user.photo.url if item.user.photo else None,
            "participant_role": item.role,
            "last_read_at": item.last_read_at.isoformat() if item.last_read_at else None,
        }
        for item in participants
    ]
    return {
        "id": str(chat.id),
        "chat_type": chat.chat_type,
        "scope": chat_scope(chat),
        "group": str(chat.group_id) if chat.group_id else None,
        "title": chat_title_for_user(chat, user),
        "name": chat.name,
        "is_active": chat.is_active,
        "created_at": chat.created_at.isoformat(),
        "updated_at": (last_message.created_at if last_message else chat.created_at).isoformat(),
        "last_message": serialize_message(last_message) if last_message else None,
        "unread_count": chat.messages.filter(statuses__user=user, statuses__is_read=False).count(),
        "participants": [str(item["id"]) for item in participant_payload],
        "participant_details": participant_payload,
    }
