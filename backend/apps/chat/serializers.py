from rest_framework import serializers
from drf_spectacular.utils import OpenApiTypes, extend_schema_field

from apps.accounts.models import User

from .models import Chat, Message
from .services import serialize_chat, serialize_message


class ChatSerializer(serializers.ModelSerializer):
    payload = serializers.SerializerMethodField()

    class Meta:
        model = Chat
        fields = ("id", "payload")

    def to_representation(self, instance):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            return serialize_chat(instance, request.user)
        return super().to_representation(instance)

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_payload(self, obj):
        request = self.context.get("request")
        return serialize_chat(obj, request.user) if request else {}


class MessageSerializer(serializers.ModelSerializer):
    payload = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ("id", "payload")

    def to_representation(self, instance):
        return serialize_message(instance)

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
            raise serializers.ValidationError({"file": "File is required for selected message type"})
        return attrs


class DirectChatCreateSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    chat_type = serializers.ChoiceField(
        choices=["student_teacher", "parent_teacher", "director_staff", "director_admin", "support"],
        required=False,
    )

    def validate_user_id(self, value):
        try:
            target = User.objects.get(id=value, is_active=True)
        except User.DoesNotExist as exc:
            raise serializers.ValidationError("User not found") from exc
        if self.context["request"].user.id == target.id:
            raise serializers.ValidationError("Cannot create a chat with yourself")
        self.context["target_user"] = target
        return value
