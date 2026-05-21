from django.db import transaction
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import IsBranchAdmin, IsTeacher
from apps.courses.models import GroupMembership
from apps.notifications.services import NotificationService

from .models import Attendance, Lesson
from .serializers import (
    AttendanceSerializer,
    BulkAttendanceSerializer,
    LessonSerializer,
    SubstituteTeacherSerializer,
)


class LessonViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Lesson.objects.select_related("group", "teacher", "room").all()
    serializer_class = LessonSerializer

    def get_permissions(self):
        if self.action == "substitute_teacher":
            permission_classes = [IsBranchAdmin]
        elif self.action == "attendance":
            if self.request.method == "GET":
                permission_classes = [permissions.IsAuthenticated]
            else:
                permission_classes = [IsTeacher]
        elif self.action in ("update", "partial_update"):
            permission_classes = [IsBranchAdmin]
        else:
            permission_classes = [permissions.IsAuthenticated]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if not user.is_authenticated:
            return qs.none()

        if user.role in ("superadmin", "director"):
            scoped = qs
        elif user.role in ("admin", "branch_admin") and hasattr(user, "staff_profile"):
            branch_id = user.staff_profile.branch_id
            scoped = qs.filter(group__branch_id=branch_id) if branch_id else qs.none()
        elif user.role == "teacher" and hasattr(user, "staff_profile"):
            scoped = qs.filter(group__teacher=user.staff_profile)
        elif user.role == "student" and hasattr(user, "student_profile"):
            scoped = qs.filter(
                group__memberships__student=user.student_profile,
                group__memberships__left_at__isnull=True,
            )
        elif user.role == "parent" and hasattr(user, "parent_profile"):
            scoped = qs.filter(
                group__memberships__student__parents=user.parent_profile,
                group__memberships__left_at__isnull=True,
            )
        else:
            scoped = qs.none()

        params = self.request.query_params
        if params.get("group_id"):
            scoped = scoped.filter(group_id=params["group_id"])
        if params.get("status"):
            scoped = scoped.filter(status=params["status"])
        if params.get("date"):
            scoped = scoped.filter(datetime__date=params["date"])
        if params.get("date_from"):
            scoped = scoped.filter(datetime__date__gte=params["date_from"])
        if params.get("date_to"):
            scoped = scoped.filter(datetime__date__lte=params["date_to"])
        return scoped.distinct().order_by("datetime")

    @action(detail=True, methods=["patch"], url_path="substitute")
    def substitute_teacher(self, request, pk=None):
        lesson = self.get_object()
        serializer = SubstituteTeacherSerializer(data=request.data, context={"lesson": lesson})
        serializer.is_valid(raise_exception=True)

        substitute_teacher = serializer.context["teacher"]
        if lesson.original_teacher_id is None:
            lesson.original_teacher = lesson.teacher
        lesson.teacher = substitute_teacher
        lesson.is_substitute = True
        lesson.save(update_fields=["teacher", "is_substitute", "original_teacher"])

        return Response(LessonSerializer(lesson).data, status=status.HTTP_200_OK)

    def perform_update(self, serializer):
        previous_status = serializer.instance.status
        lesson = serializer.save()
        if previous_status != "cancelled" and lesson.status == "cancelled":
            NotificationService.on_lesson_cancelled(lesson)

    @action(detail=True, methods=["get", "post"], url_path="attendance")
    def attendance(self, request, pk=None):
        lesson = self.get_object()
        if request.method == "GET":
            attendance_qs = lesson.attendance.select_related("student", "recorded_by")
            serializer = AttendanceSerializer(attendance_qs, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)

        serializer = BulkAttendanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        records = serializer.validated_data["records"]

        saved = []
        with transaction.atomic():
            for record in records:
                student_id = record["student_id"]
                in_group = GroupMembership.objects.filter(
                    group=lesson.group,
                    student_id=student_id,
                    left_at__isnull=True,
                ).exists()
                if not in_group:
                    return Response(
                        {"detail": f"Student {student_id} is not active in this group"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                attendance, created = Attendance.objects.get_or_create(
                    lesson=lesson,
                    student_id=student_id,
                    defaults={
                        "status": record["status"],
                        "late_minutes": record.get("late_minutes"),
                        "comment": record.get("comment", ""),
                        "recorded_by": request.user,
                    },
                )
                if not created:
                    attendance.status = record["status"]
                    attendance.late_minutes = record.get("late_minutes")
                    attendance.comment = record.get("comment", "")
                    attendance.recorded_by = request.user
                    attendance.save()
                saved.append(attendance)

            if lesson.status not in ("cancelled", "rescheduled"):
                if any(r.status in ("present", "late", "absent") for r in saved):
                    if lesson.status != "conducted":
                        lesson.status = "conducted"
                        lesson.save(update_fields=["status"])

        output = AttendanceSerializer(saved, many=True)
        return Response(output.data, status=status.HTTP_200_OK)


class AttendanceViewSet(mixins.ListModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    queryset = Attendance.objects.select_related("lesson", "student").all()
    serializer_class = AttendanceSerializer

    def get_permissions(self):
        if self.action == "list":
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
        elif user.role in ("admin", "branch_admin") and hasattr(user, "staff_profile"):
            branch_id = user.staff_profile.branch_id
            scoped = qs.filter(lesson__group__branch_id=branch_id) if branch_id else qs.none()
        elif user.role == "teacher" and hasattr(user, "staff_profile"):
            scoped = qs.filter(lesson__group__teacher=user.staff_profile)
        elif user.role == "student" and hasattr(user, "student_profile"):
            scoped = qs.filter(student=user.student_profile)
        elif user.role == "parent" and hasattr(user, "parent_profile"):
            scoped = qs.filter(student__parents=user.parent_profile)
        else:
            scoped = qs.none()

        lesson_id = self.request.query_params.get("lesson_id")
        if lesson_id:
            scoped = scoped.filter(lesson_id=lesson_id)
        student_id = self.request.query_params.get("student_id")
        if student_id:
            scoped = scoped.filter(student_id=student_id)
        return scoped.order_by("-lesson__datetime")

    def update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return super().update(request, *args, **kwargs)

    def perform_update(self, serializer):
        serializer.save(recorded_by=self.request.user)
