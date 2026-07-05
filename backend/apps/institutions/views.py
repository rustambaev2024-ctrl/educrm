from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from django.db import connection

from apps.accounts.permissions import IsBranchAdmin, IsDirector
from apps.staff.models import Staff
from apps.students.models import Student
from apps.tenants.models import Institution

from .models import Branch, Room
from .serializers import BranchSerializer, InstitutionSettingsSerializer, RoomSerializer


class BranchViewSet(viewsets.ModelViewSet):
    queryset = Branch.objects.all().order_by("-created_at")
    serializer_class = BranchSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve", "institution_settings"):
            permission_classes = [permissions.IsAuthenticated]
        elif self.action == "debtors":
            permission_classes = [IsBranchAdmin]
        else:
            permission_classes = [IsDirector]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if not user.is_authenticated:
            return qs.none()

        if user.role in ("superadmin", "director"):
            return qs

        if user.role in ("branch_admin", "teacher") and hasattr(user, "staff_profile"):
            branch_id = user.staff_profile.branch_id
            if branch_id:
                return qs.filter(id=branch_id)
            return qs.none()
        if user.role == "student" and hasattr(user, "student_profile"):
            branch_id = user.student_profile.branch_id
            return qs.filter(id=branch_id) if branch_id else qs.none()
        if user.role == "parent" and hasattr(user, "parent_profile"):
            return qs.filter(students__parents=user.parent_profile).distinct()

        return qs

    def perform_destroy(self, instance):
        from apps.courses.models import Group

        force = self.request.query_params.get("force") == "true"
        if not force:
            active_students = Student.objects.filter(branch=instance, status="active").count()
            active_staff = Staff.objects.filter(branch=instance, status="active").count()
            active_groups = Group.objects.filter(branch=instance, status__in=["recruiting", "active"]).count()

            if active_students or active_staff or active_groups:
                raise ValidationError({
                    "detail": {
                        "uz": f"Bu filialda {active_students} o'quvchi, {active_staff} xodim, {active_groups} guruh bor",
                        "ru": f"В филиале {active_students} студентов, {active_staff} сотрудников, {active_groups} групп",
                    },
                    "active_counts": {
                        "students": active_students,
                        "staff": active_staff,
                        "groups": active_groups,
                    },
                })
        instance.delete()

    @action(detail=True, methods=["get"], url_path="debtors", permission_classes=[IsBranchAdmin])
    def debtors(self, request, pk=None):
        branch = self.get_object()
        debtors = (
            Student.objects.select_related("user")
            .filter(branch=branch, wallet_balance__lt=0)
            .order_by("user__full_name")
        )
        payload = [
            {
                "student_id": str(student.id),
                "full_name": student.user.full_name,
                "phone": student.user.phone,
                "status": student.status,
                "wallet_balance": str(student.wallet_balance),
            }
            for student in debtors
        ]
        return Response(
            {
                "branch_id": str(branch.id),
                "debtors_count": len(payload),
                "results": payload,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get", "patch"], url_path="meta-settings", permission_classes=[IsDirector])
    def meta_settings(self, request):
        institution = request.tenant
        if request.method == "GET":
            return Response(
                {
                    "meta_pixel_id": institution.meta_pixel_id,
                    "meta_access_token": "***" if institution.meta_access_token else "",
                },
                status=status.HTTP_200_OK,
            )

        if "meta_pixel_id" in request.data:
            institution.meta_pixel_id = request.data["meta_pixel_id"]
        if "meta_access_token" in request.data:
            institution.meta_access_token = request.data["meta_access_token"]
        institution.save(update_fields=["meta_pixel_id", "meta_access_token"])
        return Response({"detail": "Saved"}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get", "patch"], url_path="sms-settings", permission_classes=[IsDirector])
    def sms_settings(self, request):
        institution = request.tenant
        if request.method == "GET":
            return Response(
                {
                    "sms_enabled": institution.sms_enabled,
                    "sms_email": institution.sms_email,
                    "sms_password": "••••••••" if institution.sms_password else "",
                    "sms_sender": institution.sms_sender,
                },
                status=status.HTTP_200_OK,
            )

        data = request.data
        if "sms_enabled" in data:
            institution.sms_enabled = data["sms_enabled"]
        if "sms_email" in data:
            institution.sms_email = data["sms_email"]
        if "sms_password" in data and data["sms_password"] != "••••••••":
            institution.sms_password = data["sms_password"]
        if "sms_sender" in data:
            institution.sms_sender = data["sms_sender"]
        institution.save(
            update_fields=["sms_enabled", "sms_email", "sms_password", "sms_sender"]
        )
        return Response({"success": True}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="sms-test", permission_classes=[IsDirector])
    def sms_test(self, request):
        from apps.notifications.sms import EskizSmsService

        phone = request.data.get("phone", "").strip()
        if not phone:
            return Response({"error": "phone required"}, status=status.HTTP_400_BAD_REQUEST)

        institution = request.tenant
        schema = connection.schema_name
        success = EskizSmsService.send_for_tenant(
            institution=institution,
            phone=phone,
            message="EduCRM: SMS integratsiyasi muvaffaqiyatli ulandi!",
            schema=schema,
        )
        if success:
            return Response({"success": True, "message": "SMS yuborildi"}, status=status.HTTP_200_OK)
        return Response({"error": "SMS yuborishda xatolik"}, status=status.HTTP_400_BAD_REQUEST)

    @action(
        detail=False,
        methods=["get", "patch"],
        url_path="settings",
        permission_classes=[permissions.IsAuthenticated],
        parser_classes=[MultiPartParser, FormParser, JSONParser],
    )
    def institution_settings(self, request):
        institution = request.tenant
        if request.method == "GET":
            return Response(
                {
                    "name": institution.name,
                    "address": institution.address,
                    "phone": institution.phone,
                    "logo": request.build_absolute_uri(institution.logo.url) if institution.logo else None,
                },
                status=status.HTTP_200_OK,
            )

        if request.user.role not in ("director", "superadmin"):
            return Response({"detail": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        data = request.data
        if "name" in data:
            institution.name = data["name"]
        if "address" in data:
            institution.address = data["address"]
        if "phone" in data:
            institution.phone = data["phone"]

        if "logo" in request.FILES:
            institution.logo = request.FILES["logo"]

        update_fields = (
            ["name", "address", "phone", "logo"]
            if "logo" in request.FILES
            else ["name", "address", "phone"]
        )
        institution.save(update_fields=update_fields)

        return Response(
            {
                "name": institution.name,
                "address": institution.address,
                "phone": institution.phone,
                "logo": request.build_absolute_uri(institution.logo.url) if institution.logo else None,
            },
            status=status.HTTP_200_OK
        )


class RoomViewSet(viewsets.ModelViewSet):
    queryset = Room.objects.select_related("branch").all().order_by("branch__name", "name")
    serializer_class = RoomSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            permission_classes = [permissions.IsAuthenticated]
        else:
            permission_classes = [IsBranchAdmin]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if not user.is_authenticated:
            return qs.none()

        if user.role in ("superadmin", "director"):
            scoped = qs
        elif user.role in ("branch_admin", "teacher") and hasattr(user, "staff_profile"):
            branch_id = user.staff_profile.branch_id
            scoped = qs.filter(branch_id=branch_id) if branch_id else qs.none()
        elif user.role == "student" and hasattr(user, "student_profile"):
            branch_id = user.student_profile.branch_id
            scoped = qs.filter(branch_id=branch_id) if branch_id else qs.none()
        elif user.role == "parent" and hasattr(user, "parent_profile"):
            scoped = qs.filter(branch__students__parents=user.parent_profile).distinct()
        else:
            scoped = qs.none()

        branch_id = self.request.query_params.get("branch_id")
        if branch_id:
            scoped = scoped.filter(branch_id=branch_id)
        return scoped

    def perform_destroy(self, instance):
        from apps.courses.models import Group

        active_groups = Group.objects.filter(
            room=instance,
            status__in=["recruiting", "active"],
        )
        if active_groups.exists():
            group_names = ", ".join(active_groups.values_list("name", flat=True)[:3])
            raise ValidationError(
                {
                    "detail": (
                        f"Кабинет используется группами: {group_names}. "
                        "Сначала переназначьте группы на другой кабинет."
                    )
                }
            )
        instance.delete()
