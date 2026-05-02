from django.db import transaction
from django.db.models import Q
from rest_framework import mixins, permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import IsBranchAdmin, IsTeacher
from apps.chat.services import add_student_to_group_chat, remove_student_from_group_chat
from apps.students.models import Student

from .models import Course, Group, GroupMembership
from .serializers import (
    CourseSerializer,
    GroupAddStudentSerializer,
    GroupRemoveStudentSerializer,
    GroupSerializer,
)


class CourseViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Course.objects.all().order_by("name")
    serializer_class = CourseSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            permission_classes = [IsBranchAdmin]
        else:
            permission_classes = [permissions.IsAuthenticated]
        return [permission() for permission in permission_classes]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        course = self.get_object()
        if course.groups.exists():
            return Response(
                {"detail": "Course has groups and cannot be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(description__icontains=search))
        user = self.request.user
        if user.role in ("superadmin", "director", "admin", "branch_admin"):
            return qs
        if user.role == "teacher" and hasattr(user, "staff_profile"):
            return qs.filter(groups__teacher=user.staff_profile).distinct()
        if user.role == "student" and hasattr(user, "student_profile"):
            return qs.filter(
                groups__memberships__student=user.student_profile,
                groups__memberships__left_at__isnull=True,
            ).distinct()
        if user.role == "parent" and hasattr(user, "parent_profile"):
            return qs.filter(
                groups__memberships__student__parents=user.parent_profile,
                groups__memberships__left_at__isnull=True,
            ).distinct()
        return qs


class GroupViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Group.objects.select_related("course", "branch", "teacher").all().order_by("name")
    serializer_class = GroupSerializer

    def get_permissions(self):
        if self.action in ("create", "add_student", "remove_student"):
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
        elif user.role in ("admin", "branch_admin", "teacher") and hasattr(user, "staff_profile"):
            branch_id = user.staff_profile.branch_id
            scoped = qs.filter(branch_id=branch_id) if branch_id else qs.none()
            if user.role == "teacher":
                scoped = scoped.filter(teacher=user.staff_profile)
        elif user.role == "student" and hasattr(user, "student_profile"):
            scoped = qs.filter(memberships__student=user.student_profile, memberships__left_at__isnull=True)
        elif user.role == "parent" and hasattr(user, "parent_profile"):
            scoped = qs.filter(memberships__student__parents=user.parent_profile, memberships__left_at__isnull=True)
        else:
            scoped = qs.none()

        params = self.request.query_params
        if params.get("branch_id"):
            scoped = scoped.filter(branch_id=params["branch_id"])
        if params.get("status"):
            scoped = scoped.filter(status=params["status"])
        if params.get("course_id"):
            scoped = scoped.filter(course_id=params["course_id"])
        if params.get("search"):
            scoped = scoped.filter(name__icontains=params["search"].strip())
        return scoped.distinct()

    @transaction.atomic
    @action(detail=True, methods=["post"], url_path="students")
    def add_student(self, request, pk=None):
        group = self.get_object()
        serializer = GroupAddStudentSerializer(data=request.data, context={"group": group})
        serializer.is_valid(raise_exception=True)
        student = serializer.context["student"]

        active_exists = GroupMembership.objects.filter(
            group=group,
            student=student,
            left_at__isnull=True,
        ).exists()
        if active_exists:
            return Response(
                {"detail": "Student already in this group"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        membership = GroupMembership.objects.create(
            group=group,
            student=student,
            enrolled_by=request.user,
        )
        add_student_to_group_chat(group, student)
        return Response(
            {
                "detail": "Student added to group",
                "membership_id": str(membership.id),
            },
            status=status.HTTP_201_CREATED,
        )

    @transaction.atomic
    @action(
        detail=True,
        methods=["delete"],
        url_path=r"students/(?P<student_id>[0-9a-f-]+)",
    )
    def remove_student(self, request, pk=None, student_id=None):
        group = self.get_object()
        try:
            student = Student.objects.get(id=student_id)
        except Student.DoesNotExist:
            return Response({"detail": "Student not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = GroupRemoveStudentSerializer(data={"student_id": student.id})
        serializer.is_valid(raise_exception=True)
        try:
            membership = serializer.close_membership(group, student)
        except serializers.ValidationError as exc:
            return Response({"detail": exc.detail[0]}, status=status.HTTP_400_BAD_REQUEST)
        remove_student_from_group_chat(group, student)

        return Response(
            {
                "detail": "Student removed from group",
                "membership_id": str(membership.id),
            },
            status=status.HTTP_200_OK,
        )
