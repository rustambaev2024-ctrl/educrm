import uuid

from django.conf import settings
from django.db import models


class Chat(models.Model):
    CHAT_TYPE_CHOICES = [
        ("group_chat", "Group Chat"),
        ("student_teacher", "Student Teacher"),
        ("parent_teacher", "Parent Teacher"),
        ("director_staff", "Director Staff"),
        ("director_admin", "Director Admin"),
        ("support", "Support"),
        ("system_notifications", "System"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    chat_type = models.CharField(max_length=30, choices=CHAT_TYPE_CHOICES)
    group = models.OneToOneField(
        "courses.Group",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="chat",
    )
    name = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "chat_chat"
        ordering = ["-created_at"]


class ChatParticipant(models.Model):
    ROLE_CHOICES = [("member", "Member"), ("admin", "Admin"), ("readonly", "Read Only")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    chat = models.ForeignKey(Chat, on_delete=models.CASCADE, related_name="participants")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_participations",
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="member")
    joined_at = models.DateTimeField(auto_now_add=True)
    left_at = models.DateTimeField(null=True, blank=True)
    last_read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "chat_participant"
        unique_together = ("chat", "user")


class Message(models.Model):
    MESSAGE_TYPE_CHOICES = [
        ("text", "Text"),
        ("file", "File"),
        ("image", "Image"),
        ("voice", "Voice"),
        ("system", "System"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    chat = models.ForeignKey(Chat, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sent_messages",
    )
    message_type = models.CharField(max_length=10, choices=MESSAGE_TYPE_CHOICES, default="text")
    text = models.TextField(blank=True)
    file = models.FileField(upload_to="chat_files/%Y/%m/", null=True, blank=True)
    reply_to = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="replies",
    )
    is_edited = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "chat_message"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["chat", "created_at"])]


class MessageStatus(models.Model):
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name="statuses")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "chat_message_status"
        unique_together = ("message", "user")
