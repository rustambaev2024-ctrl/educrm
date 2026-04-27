from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser
from django_tenants.utils import schema_context

from .models import Notification


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.user = self.scope.get("user", AnonymousUser())
        self.schema_name = self.scope.get("schema_name", "public")
        if self.user.is_anonymous:
            await self.close(code=4001)
            return
        self.group_name = f"notifications_{self.user.id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        unread_count = await self._unread_count()
        await self.send_json({"type": "notification.count", "unread_count": unread_count})

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def notification_new(self, event):
        await self.send_json({"type": "notification.new", "notification": event["notification"]})

    async def notification_count(self, event):
        await self.send_json({"type": "notification.count", "unread_count": event["unread_count"]})

    @database_sync_to_async
    def _unread_count(self):
        with schema_context(self.schema_name):
            return Notification.objects.filter(recipient=self.user, is_read=False).count()
