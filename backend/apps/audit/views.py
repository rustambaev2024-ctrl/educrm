from rest_framework import mixins, viewsets

from apps.accounts.permissions import IsDirector

from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = AuditLog.objects.select_related("user").all()
    serializer_class = AuditLogSerializer
    permission_classes = [IsDirector]

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get("user_id"):
            qs = qs.filter(user_id=params["user_id"])
        if params.get("action"):
            qs = qs.filter(action=params["action"])
        if params.get("entity_type"):
            qs = qs.filter(entity_type=params["entity_type"])
        if params.get("date_from"):
            qs = qs.filter(timestamp__date__gte=params["date_from"])
        if params.get("date_to"):
            qs = qs.filter(timestamp__date__lte=params["date_to"])
        return qs.order_by("-timestamp")
