from django.db.models import Count, Q
from django_tenants.utils import schema_context
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import IsSuperAdmin
from apps.tenants.models import Institution

from .models import InstitutionActionLog
from .serializers import (
    InstitutionActionLogSerializer,
    InstitutionNoticeSerializer,
    InstitutionSerializer,
)
from .services import create_institution_with_bootstrap, create_notice, set_institution_status


class SuperadminInstitutionViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = InstitutionSerializer
    permission_classes = [IsSuperAdmin]

    def list(self, request, *args, **kwargs):
        with schema_context("public"):
            return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        with schema_context("public"):
            return super().retrieve(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        with schema_context("public"):
            institution = self.get_object()
            try:
                institution.delete(force_drop=True)
            except TypeError:
                institution.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        queryset = Institution.objects.annotate(
            notices_count=Count("notices", distinct=True),
            logs_count=Count("superadmin_logs", distinct=True),
        ).exclude(schema_name="demo").order_by("-created_at")
        params = self.request.query_params
        if params.get("status"):
            queryset = queryset.filter(status=params["status"])
        if params.get("search"):
            search = params["search"].strip()
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(slug__icontains=search)
                | Q(schema_name__icontains=search)
            )
        return queryset

    def create(self, request, *args, **kwargs):
        with schema_context("public"):
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            institution = create_institution_with_bootstrap(serializer, request.user)
            return Response(
                self.get_serializer(institution).data,
                status=status.HTTP_201_CREATED,
            )

    @action(detail=True, methods=["patch"], url_path="freeze")
    def freeze(self, request, pk=None):
        with schema_context("public"):
            institution = set_institution_status(
                self.get_object(),
                "frozen",
                request.user,
                request.data.get("message", ""),
            )
            return Response(self.get_serializer(institution).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["patch"], url_path="unfreeze")
    def unfreeze(self, request, pk=None):
        with schema_context("public"):
            institution = set_institution_status(
                self.get_object(),
                "active",
                request.user,
                request.data.get("message", ""),
            )
            return Response(self.get_serializer(institution).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["patch"], url_path="archive")
    def archive(self, request, pk=None):
        with schema_context("public"):
            institution = set_institution_status(
                self.get_object(),
                "archived",
                request.user,
                request.data.get("message", ""),
            )
            return Response(self.get_serializer(institution).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="notify")
    def notify(self, request, pk=None):
        with schema_context("public"):
            institution = self.get_object()
            serializer = InstitutionNoticeSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            notice = create_notice(
                institution,
                title=serializer.validated_data["title"],
                body=serializer.validated_data["body"],
                send_at=serializer.validated_data.get("send_at"),
                user=request.user,
            )
            return Response(
                InstitutionNoticeSerializer(notice).data,
                status=status.HTTP_201_CREATED,
            )


class SuperadminLogViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = InstitutionActionLogSerializer
    permission_classes = [IsSuperAdmin]

    def list(self, request, *args, **kwargs):
        with schema_context("public"):
            return super().list(request, *args, **kwargs)

    def get_queryset(self):
        queryset = InstitutionActionLog.objects.select_related("institution").all()
        params = self.request.query_params
        if params.get("institution_id"):
            queryset = queryset.filter(institution_id=params["institution_id"])
        if params.get("action"):
            queryset = queryset.filter(action=params["action"])
        if params.get("search"):
            search = params["search"].strip()
            queryset = queryset.filter(
                Q(institution__name__icontains=search)
                | Q(message__icontains=search)
                | Q(actor_phone__icontains=search)
            )
        return queryset.order_by("-created_at")
