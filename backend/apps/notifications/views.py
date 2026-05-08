from django.utils import timezone
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = Notification.objects.filter(recipient=self.request.user)
        if self.request.query_params.get("unread") == "true":
            queryset = queryset.filter(is_read=False)
        return queryset.order_by("-created_at")

    @action(detail=False, methods=["patch", "post"], url_path="read-all")
    def read_all(self, request):
        now = timezone.now()
        Notification.objects.filter(recipient=request.user, is_read=False).update(
            is_read=True,
            read_at=now,
        )
        return Response({"detail": "All notifications marked as read"}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="count")
    def count(self, request):
        unread_count = Notification.objects.filter(recipient=request.user, is_read=False).count()
        return Response({"unread_count": unread_count}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["patch", "post"], url_path="read")
    def read_one(self, request, pk=None):
        notification = self.get_object()
        if not notification.is_read:
            notification.is_read = True
            notification.read_at = timezone.now()
            notification.save(update_fields=["is_read", "read_at"])
        return Response(NotificationSerializer(notification).data, status=status.HTTP_200_OK)
