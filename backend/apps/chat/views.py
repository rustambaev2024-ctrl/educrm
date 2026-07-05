from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.pagination import CursorPagination
from rest_framework.response import Response

from .models import Chat, ChatParticipant, Message
from .serializers import ChatSerializer, DirectChatCreateSerializer, MessageCreateSerializer, MessageSerializer
from .services import (
    create_message,
    delete_message,
    edit_message,
    get_or_create_direct_chat,
    mark_chat_as_read,
    serialize_message,
)


class MessageCursorPagination(CursorPagination):
    page_size = 50
    ordering = "-created_at"
    cursor_query_param = "cursor"
    page_size_query_param = "limit"
    max_page_size = 100


class ChatViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = Chat.objects.all().order_by("-created_at")
    serializer_class = ChatSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = MessageCursorPagination

    def get_queryset(self):
        user = self.request.user
        return (
            super()
            .get_queryset()
            .filter(participants__user=user, participants__left_at__isnull=True)
            .distinct()
        )

    @action(
        detail=True,
        methods=["get", "post"],
        url_path="messages",
        parser_classes=[JSONParser, MultiPartParser, FormParser],
    )
    def messages(self, request, pk=None):
        chat = self.get_object()
        if request.method == "GET":
            queryset = chat.messages.select_related("sender")
            paginator = MessageCursorPagination()
            page = paginator.paginate_queryset(queryset, request, view=self)
            payload = [serialize_message(message) for message in page]
            return paginator.get_paginated_response(payload)

        serializer = MessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = create_message(
            chat,
            request.user,
            text=serializer.validated_data.get("text", ""),
            message_type=serializer.validated_data.get("message_type", "text"),
            reply_to_id=serializer.validated_data.get("reply_to_id"),
            file=serializer.validated_data.get("file"),
        )
        return Response(serialize_message(message), status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None):
        chat = self.get_object()
        mark_chat_as_read(chat, request.user)
        return Response({"detail": "Chat marked as read"}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="direct")
    def direct(self, request):
        serializer = DirectChatCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        target = serializer.context["target_user"]
        chat_type = serializer.validated_data.get("chat_type") or self._infer_direct_chat_type(request.user, target)
        chat = get_or_create_direct_chat(request.user, target, chat_type)
        return Response(ChatSerializer(chat, context={"request": request}).data, status=status.HTTP_200_OK)

    def _infer_direct_chat_type(self, actor, target):
        roles = {actor.role, target.role}
        if "parent" in roles and "teacher" in roles:
            return "parent_teacher"
        if "student" in roles and "teacher" in roles:
            return "student_teacher"
        if "director" in roles and "branch_admin" in roles:
            return "director_admin"
        if "director" in roles:
            return "director_staff"
        return "support"

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        count = (
            Message.objects.filter(chat__participants__user=request.user)
            .filter(statuses__user=request.user, statuses__is_read=False)
            .count()
        )
        return Response({"unread_count": count}, status=status.HTTP_200_OK)


class MessageViewSet(viewsets.GenericViewSet):
    queryset = Message.objects.select_related("chat", "sender").all()
    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        message = super().get_object()
        participant_exists = ChatParticipant.objects.filter(
            chat=message.chat,
            user=self.request.user,
            left_at__isnull=True,
        ).exists()
        if not participant_exists:
            self.permission_denied(self.request, message="Not a chat participant")
        return message

    @action(detail=True, methods=["patch"])
    def edit(self, request, pk=None):
        message = self.get_object()
        if message.sender_id != request.user.id:
            self.permission_denied(request, message="Only sender can edit message")
        new_text = request.data.get("text", "")
        if not str(new_text).strip():
            return Response({"detail": "text is required"}, status=status.HTTP_400_BAD_REQUEST)
        message = edit_message(message, str(new_text))
        return Response(serialize_message(message), status=status.HTTP_200_OK)

    @action(detail=True, methods=["delete"])
    def remove(self, request, pk=None):
        message = self.get_object()
        if message.sender_id != request.user.id:
            self.permission_denied(request, message="Only sender can delete message")
        delete_message(message)
        return Response(status=status.HTTP_204_NO_CONTENT)
