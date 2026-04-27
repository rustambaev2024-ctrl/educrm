from django.contrib import admin

from .models import Chat, ChatParticipant, Message, MessageStatus


@admin.register(Chat)
class ChatAdmin(admin.ModelAdmin):
    list_display = ("id", "chat_type", "group", "name", "is_active", "created_at")
    list_filter = ("chat_type", "is_active")
    search_fields = ("name",)


@admin.register(ChatParticipant)
class ChatParticipantAdmin(admin.ModelAdmin):
    list_display = ("chat", "user", "role", "joined_at", "left_at")
    list_filter = ("role",)
    search_fields = ("user__full_name", "user__phone")


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "chat", "sender", "message_type", "is_deleted", "created_at")
    list_filter = ("message_type", "is_deleted")
    search_fields = ("text", "sender__full_name")


@admin.register(MessageStatus)
class MessageStatusAdmin(admin.ModelAdmin):
    list_display = ("message", "user", "is_read", "read_at")
    list_filter = ("is_read",)
