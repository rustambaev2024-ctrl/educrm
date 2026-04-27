from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser
from django_tenants.utils import schema_context

from .models import Chat, ChatParticipant, Message
from .services import (
    create_message,
    delete_message,
    edit_message,
    mark_chat_as_read,
    serialize_message,
)


class ChatConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.chat_id = self.scope["url_route"]["kwargs"]["chat_id"]
        self.schema_name = self.scope.get("schema_name", "public")
        self.user = self.scope.get("user", AnonymousUser())
        if self.user.is_anonymous:
            await self.close(code=4001)
            return
        allowed = await self._is_participant()
        if not allowed:
            await self.close(code=4003)
            return

        self.chat_group_name = f"chat_{self.chat_id}"
        await self.channel_layer.group_add(self.chat_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "chat_group_name"):
            await self.channel_layer.group_discard(self.chat_group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        event_type = content.get("type")
        if event_type == "message.new":
            await self._create_message(content)
        elif event_type == "message.edit":
            await self._edit_message(content)
        elif event_type == "message.delete":
            await self._delete_message(content)
        elif event_type == "message.read":
            await self._mark_read()

    async def message_new(self, event):
        await self.send_json({"type": "message.new", "message": event["message"]})

    async def message_edit(self, event):
        await self.send_json({"type": "message.edit", "message": event["message"]})

    async def message_delete(self, event):
        await self.send_json(
            {
                "type": "message.delete",
                "chat_id": event["chat_id"],
                "message_id": event["message_id"],
            }
        )

    async def message_read(self, event):
        await self.send_json(
            {
                "type": "message.read",
                "chat_id": event["chat_id"],
                "user_id": event["user_id"],
                "read_at": event["read_at"],
            }
        )

    @database_sync_to_async
    def _is_participant(self):
        with schema_context(self.schema_name):
            return ChatParticipant.objects.filter(
                chat_id=self.chat_id,
                user=self.user,
                left_at__isnull=True,
            ).exists()

    @database_sync_to_async
    def _create_message(self, payload):
        with schema_context(self.schema_name):
            chat = Chat.objects.get(id=self.chat_id)
            message = create_message(
                chat,
                self.user,
                text=payload.get("text", ""),
                message_type=payload.get("message_type", "text"),
                reply_to_id=payload.get("reply_to_id"),
            )
            return serialize_message(message)

    @database_sync_to_async
    def _edit_message(self, payload):
        with schema_context(self.schema_name):
            message_id = payload.get("message_id")
            new_text = payload.get("new_text", "")
            message = Message.objects.filter(id=message_id, chat_id=self.chat_id).first()
            if message is None or message.sender_id != self.user.id:
                return None
            message = edit_message(message, new_text)
            return serialize_message(message)

    @database_sync_to_async
    def _delete_message(self, payload):
        with schema_context(self.schema_name):
            message_id = payload.get("message_id")
            message = Message.objects.filter(id=message_id, chat_id=self.chat_id).first()
            if message is None or message.sender_id != self.user.id:
                return None
            delete_message(message)
            return {"chat_id": str(self.chat_id), "message_id": str(message.id)}

    @database_sync_to_async
    def _mark_read(self):
        with schema_context(self.schema_name):
            chat = Chat.objects.get(id=self.chat_id)
            mark_chat_as_read(chat, self.user)
            participant = ChatParticipant.objects.get(chat=chat, user=self.user)
            return {
                "chat_id": str(chat.id),
                "user_id": str(self.user.id),
                "read_at": (
                    participant.last_read_at.isoformat() if participant.last_read_at else None
                ),
            }
