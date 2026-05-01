from django.db.models import Count, Q
from django_tenants.utils import schema_context
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import IsSuperAdmin
from apps.institutions.models import Branch
from apps.institutions.serializers import BranchSerializer
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
            schema_name = institution.schema_name
            try:
                institution.delete(force_drop=True)
            except Exception as e:
                # If delete fails due to active connections, forcefully drop it or delete the record anyway
                from django.db import connection
                try:
                    with connection.cursor() as cursor:
                        cursor.execute(f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE')
                except Exception:
                    pass
                try:
                    super(Institution, institution).delete()
                except Exception:
                    pass
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
            try:
                serializer.is_valid(raise_exception=True)
                institution = create_institution_with_bootstrap(serializer, request.user)
                return Response(
                    self.get_serializer(institution).data,
                    status=status.HTTP_201_CREATED,
                )
            except Exception as e:
                import traceback
                with open("create_error.log", "a") as f:
                    f.write(traceback.format_exc() + "\n")
                return Response(
                    {"detail": str(e)},
                    status=status.HTTP_400_BAD_REQUEST,
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

    @action(detail=True, methods=["get", "post"], url_path="branches")
    def branches(self, request, pk=None):
        with schema_context("public"):
            institution = self.get_object()

        with schema_context(institution.schema_name):
            if request.method == "GET":
                serializer = BranchSerializer(Branch.objects.all().order_by("-created_at"), many=True)
                return Response(serializer.data, status=status.HTTP_200_OK)

            serializer = BranchSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            branch = serializer.save()
            return Response(BranchSerializer(branch).data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path=r"branches/(?P<branch_id>[0-9a-f-]+)",
    )
    def branch_detail(self, request, pk=None, branch_id=None):
        with schema_context("public"):
            institution = self.get_object()

        with schema_context(institution.schema_name):
            try:
                branch = Branch.objects.get(id=branch_id)
            except Branch.DoesNotExist:
                return Response({"detail": "Branch not found"}, status=status.HTTP_404_NOT_FOUND)

            if request.method == "DELETE":
                branch.delete()
                return Response(status=status.HTTP_204_NO_CONTENT)

            serializer = BranchSerializer(branch, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)


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
