from django.db.models import Q
from rest_framework import permissions, status, viewsets
from rest_framework.response import Response

from apps.accounts.permissions import IsBranchAdmin, IsDirector

from .models import Staff, StaffPenalty, StaffBonus, SupportTeacherLink
from .serializers import (
    StaffPenaltySerializer,
    StaffSerializer,
    StaffBonusSerializer,
    SupportTeacherLinkSerializer,
)


class StaffViewSet(viewsets.ModelViewSet):
    queryset = Staff.objects.select_related("user", "branch").all().order_by("user__full_name")
    serializer_class = StaffSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve", "update", "partial_update"):
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

        if user.role in ("admin", "branch_admin") and hasattr(user, "staff_profile"):
            branch_id = user.staff_profile.branch_id
            if branch_id:
                return qs.filter(branch_id=branch_id)

        return qs.none()

    def perform_destroy(self, instance):
        from apps.courses.models import Group
        from rest_framework.exceptions import ValidationError

        if instance.user.role == "director" and self.request.user.role != "superadmin":
            raise ValidationError({
                "detail": {
                    "uz": "Direktorni faqat superadmin o'chira oladi",
                    "ru": "Удалить директора может только суперадмин",
                }
            })

        if instance.user == self.request.user:
            raise ValidationError({
                "uz": "O'zingizni o'chira olmaysiz",
                "ru": "Нельзя удалить свой собственный аккаунт",
            })

        if instance.user.role == "support_teacher":
            active_links = SupportTeacherLink.objects.filter(
                support_teacher=instance.user,
                teacher__teaching_groups__status="active",
            ).distinct()
            if active_links.exists():
                teacher_names = ", ".join(
                    active_links.values_list("teacher__user__full_name", flat=True)[:3]
                )
                raise ValidationError({
                    "uz": f"Bu yordamchi o'qituvchini o'chib bo'lmaydi — faol dars o'qituvchilari bilan bog'langan: {teacher_names}",
                    "ru": f"Нельзя удалить этого помощника — он привязан к активным учителям: {teacher_names}",
                })
        else:
            active_groups = Group.objects.filter(teacher=instance, status="active")
            if active_groups.exists():
                group_names = ", ".join(active_groups.values_list("name", flat=True)[:3])
                raise ValidationError({
                    "uz": f"O'qituvchini o'chirib bo'lmaydi — faol guruhlar mavjud: {group_names}",
                    "ru": f"Нельзя удалить учителя — есть активные группы: {group_names}",
                })
        instance.delete()


class SupportTeacherViewSet(viewsets.ModelViewSet):
    serializer_class = SupportTeacherLinkSerializer
    permission_classes = [permissions.IsAuthenticated, IsBranchAdmin]

    def get_queryset(self):
        user = self.request.user
        qs = SupportTeacherLink.objects.select_related(
            "support_teacher", "teacher__user"
        ).order_by("-created_at")

        if not user.is_authenticated:
            return qs.none()

        if user.role in ("superadmin", "director"):
            pass
        elif user.role in ("admin", "branch_admin") and hasattr(user, "staff_profile"):
            branch_id = user.staff_profile.branch_id
            if branch_id:
                qs = qs.filter(teacher__branch_id=branch_id)
            else:
                return qs.none()
        elif user.role == "support_teacher":
            # Может видеть все привязки своего филиала (чтобы знать коллег)
            branch_id = getattr(getattr(user, "staff_profile", None), "branch_id", None)
            if branch_id:
                qs = qs.filter(teacher__branch_id=branch_id)
            else:
                return qs.none()
        else:
            return qs.none()

        params = self.request.query_params
        if params.get("support_teacher"):
            qs = qs.filter(support_teacher_id=params["support_teacher"])
        if params.get("teacher"):
            qs = qs.filter(teacher_id=params["teacher"])
        return qs


class StaffPenaltyViewSet(viewsets.ModelViewSet):
    queryset = StaffPenalty.objects.select_related("staff__user", "branch", "created_by").all()
    serializer_class = StaffPenaltySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if not user.is_authenticated:
            return qs.none()

        if user.role in ("superadmin", "director"):
            pass
        elif user.role in ("admin", "branch_admin"):
            if hasattr(user, "staff_profile") and user.staff_profile.branch_id:
                qs = qs.filter(branch_id=user.staff_profile.branch_id)
            else:
                return qs.none()
        elif user.role == "teacher":
            if hasattr(user, "staff_profile"):
                qs = qs.filter(staff=user.staff_profile)
            else:
                return qs.none()
        else:
            return qs.none()

        params = self.request.query_params
        if params.get("staff_id"):
            qs = qs.filter(staff_id=params["staff_id"])
        if params.get("branch_id"):
            qs = qs.filter(branch_id=params["branch_id"])
        if params.get("status"):
            qs = qs.filter(status=params["status"])
        if params.get("date_from"):
            qs = qs.filter(penalty_date__gte=params["date_from"])
        if params.get("date_to"):
            qs = qs.filter(penalty_date__lte=params["date_to"])
        if params.get("search"):
            value = params["search"].strip()
            qs = qs.filter(
                Q(reason__icontains=value)
                | Q(comment__icontains=value)
                | Q(staff__user__full_name__icontains=value)
                | Q(staff__user__phone__icontains=value)
            )
        return qs.distinct().order_by("-penalty_date", "-created_at")

    def create(self, request, *args, **kwargs):
        if request.user.role not in ("director", "superadmin"):
            return Response({"detail": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if request.user.role not in ("director", "superadmin"):
            return Response({"detail": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if request.user.role not in ("director", "superadmin"):
            return Response({"detail": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        staff = serializer.validated_data["staff"]
        branch = serializer.validated_data.get("branch") or staff.branch
        serializer.save(created_by=self.request.user, branch=branch)


class StaffBonusViewSet(viewsets.ModelViewSet):
    queryset = StaffBonus.objects.select_related("staff__user", "branch", "created_by").all()
    serializer_class = StaffBonusSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if not user.is_authenticated:
            return qs.none()

        if user.role in ("superadmin", "director"):
            pass
        elif user.role in ("admin", "branch_admin"):
            if hasattr(user, "staff_profile") and user.staff_profile.branch_id:
                qs = qs.filter(branch_id=user.staff_profile.branch_id)
            else:
                return qs.none()
        elif user.role == "teacher":
            if hasattr(user, "staff_profile"):
                qs = qs.filter(staff=user.staff_profile)
            else:
                return qs.none()
        else:
            return qs.none()

        params = self.request.query_params
        if params.get("staff_id"):
            qs = qs.filter(staff_id=params["staff_id"])
        if params.get("branch_id"):
            qs = qs.filter(branch_id=params["branch_id"])
        if params.get("date_from"):
            qs = qs.filter(bonus_date__gte=params["date_from"])
        if params.get("date_to"):
            qs = qs.filter(bonus_date__lte=params["date_to"])
        if params.get("search"):
            value = params["search"].strip()
            qs = qs.filter(
                Q(reason__icontains=value)
                | Q(comment__icontains=value)
                | Q(staff__user__full_name__icontains=value)
                | Q(staff__user__phone__icontains=value)
            )
        return qs.distinct().order_by("-bonus_date", "-created_at")

    def create(self, request, *args, **kwargs):
        if request.user.role not in ("director", "superadmin", "admin"):
            return Response({"detail": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if request.user.role not in ("director", "superadmin", "admin"):
            return Response({"detail": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if request.user.role not in ("director", "superadmin", "admin"):
            return Response({"detail": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        staff = serializer.validated_data["staff"]
        branch = serializer.validated_data.get("branch") or staff.branch
        serializer.save(created_by=self.request.user, branch=branch)
