from django.db.models import Q
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import IsSupportTeacher, IsTeacher
from apps.grades.services import upsert_homework_grade
from apps.notifications.services import NotificationService

from .models import Homework, HomeworkStatus
from .serializers import HomeworkSerializer, HomeworkStatusSerializer


class HomeworkViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Homework.objects.select_related("group", "lesson", "individual_student").all()
    serializer_class = HomeworkSerializer

    def get_permissions(self):
        if self.action in ("create", "update_status"):
            permission_classes = [IsTeacher | IsSupportTeacher]
        else:
            permission_classes = [permissions.IsAuthenticated]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()

        if user.role in ("superadmin", "director", "branch_admin"):
            scoped = qs
        elif user.role == "teacher" and hasattr(user, "staff_profile"):
            scoped = qs.filter(group__teacher_id=user.staff_profile.id)
        elif user.role == "support_teacher":
            from apps.staff.utils import get_support_teacher_group_ids
            group_ids = get_support_teacher_group_ids(user)
            scoped = qs.filter(group_id__in=group_ids)
        elif user.role == "student" and hasattr(user, "student_profile"):
            scoped = qs.filter(statuses__student=user.student_profile)
        elif user.role == "parent" and hasattr(user, "parent_profile"):
            scoped = qs.filter(statuses__student__parents=user.parent_profile)
        else:
            return qs.none()

        params = self.request.query_params
        if params.get("group_id"):
            scoped = scoped.filter(group_id=params["group_id"])
        if params.get("status"):
            scoped = scoped.filter(statuses__status=params["status"])
        if params.get("search"):
            scoped = scoped.filter(
                Q(title__icontains=params["search"]) | Q(description__icontains=params["search"])
            )
        return scoped.distinct().order_by("-created_at")

    def perform_create(self, serializer):
        homework = serializer.save(created_by=self.request.user)
        NotificationService.on_new_homework(homework)

    @action(detail=True, methods=["get"], url_path="statuses")
    def statuses(self, request, pk=None):
        homework = self.get_object()
        statuses = homework.statuses.select_related("student", "checked_by")
        serializer = HomeworkStatusSerializer(statuses, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["patch"], url_path="status")
    def update_status(self, request, pk=None):
        homework = self.get_object()
        status_id = request.data.get("status_id")
        student_id = request.data.get("student_id")

        if status_id:
            instance = homework.statuses.filter(id=status_id).first()
        elif student_id:
            instance = homework.statuses.filter(student_id=student_id).first()
        else:
            return Response(
                {"detail": "status_id or student_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if instance is None:
            return Response(
                {"detail": "Homework status not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = HomeworkStatusSerializer(
            instance,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        if updated.status in ("checked", "revision"):
            upsert_homework_grade(updated, request.user)
        return Response(HomeworkStatusSerializer(updated).data, status=status.HTTP_200_OK)


class HomeworkStatusViewSet(
    mixins.ListModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = HomeworkStatus.objects.select_related(
        "homework",
        "student",
        "checked_by",
    ).all()
    serializer_class = HomeworkStatusSerializer

    def get_permissions(self):
        if self.action in ("update", "partial_update"):
            permission_classes = [permissions.IsAuthenticated]
        else:
            permission_classes = [permissions.IsAuthenticated]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()

        is_write = self.action in ("update", "partial_update")

        if user.role in ("superadmin", "director", "branch_admin"):
            if is_write:
                return qs.none()
            scoped = qs
        elif user.role == "teacher" and hasattr(user, "staff_profile"):
            scoped = qs.filter(homework__group__teacher_id=user.staff_profile.id)
        elif user.role == "support_teacher":
            from apps.staff.utils import get_support_teacher_group_ids
            group_ids = get_support_teacher_group_ids(user)
            scoped = qs.filter(homework__group_id__in=group_ids)
        elif user.role == "student" and hasattr(user, "student_profile"):
            scoped = qs.filter(student=user.student_profile)
        elif user.role == "parent" and hasattr(user, "parent_profile"):
            if is_write:
                return qs.none()
            scoped = qs.filter(student__parents=user.parent_profile)
        else:
            return qs.none()

        homework_id = self.request.query_params.get("homework_id")
        if homework_id:
            scoped = scoped.filter(homework_id=homework_id)
        student_id = self.request.query_params.get("student_id")
        if student_id:
            scoped = scoped.filter(student_id=student_id)
        return scoped.order_by("-homework__created_at")

    def perform_update(self, serializer):
        updated = serializer.save()
        if updated.status in ("checked", "revision"):
            upsert_homework_grade(updated, self.request.user)
