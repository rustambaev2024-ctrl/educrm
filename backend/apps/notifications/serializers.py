from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = (
            "id",
            "notification_type",
            "title",
            "body",
            "related_object_type",
            "related_object_id",
            "is_read",
            "created_at",
            "read_at",
        )
