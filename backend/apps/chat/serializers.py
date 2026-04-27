from drf_spectacular.utils import OpenApiTypes, extend_schema_field
from rest_framework import serializers

from .models import Chat, Message
from .services import serialize_message


class ChatSerializer(serializers.ModelSerializer):
    unread_count = serializers.SerializerMethodField()
    participants = serializers.SerializerMethodField()
    last_message_at = serializers.SerializerMethodField()

    class Meta:
        model = Chat
        fields = (
            "id",
            "chat_type",
            "group",
            "name",
            "is_active",
            "created_at",
            "unread_count",
            "participants",
            "last_message_at",
        )

    @extend_schema_field(OpenApiTypes.INT)
    def get_unread_count(self, obj):
        user = self.context["request"].user
        return obj.messages.filter(statuses__user=user, statuses__is_read=False).count()

    @extend_schema_field(serializers.ListField(child=serializers.UUIDField()))
    def get_participants(self, obj):
        return [
            str(user_id)
            for user_id in obj.participants.filter(left_at__isnull=True).values_list(
                "user_id",
                flat=True,
            )
        ]

    @extend_schema_field(OpenApiTypes.DATETIME)
    def get_last_message_at(self, obj):
        last_message = obj.messages.order_by("-created_at").first()
        return (last_message.created_at if last_message else obj.created_at).isoformat()


class MessageSerializer(serializers.ModelSerializer):
    payload = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ("id", "payload")

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_payload(self, obj):
        return serialize_message(obj)


class MessageCreateSerializer(serializers.Serializer):
    text = serializers.CharField(required=False, allow_blank=True)
    message_type = serializers.ChoiceField(
        choices=["text", "file", "image", "voice", "system"],
        default="text",
    )
    reply_to_id = serializers.UUIDField(required=False, allow_null=True)
    file = serializers.FileField(required=False, allow_null=True)

    def validate(self, attrs):
        message_type = attrs.get("message_type", "text")
        text = attrs.get("text", "")
        file = attrs.get("file")
        if message_type == "text" and not text.strip():
            raise serializers.ValidationError({"text": "Text cannot be empty for text messages"})
        if message_type in ("file", "image", "voice") and not file:
            raise serializers.ValidationError(
                {"file": "File is required for selected message type"}
            )
        return attrs
