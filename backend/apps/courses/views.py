from django.db import transaction
from django.db.models import Q
from rest_framework import mixins, permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsBranchAdmin, IsTeacher
from apps.chat.services import add_student_to_group_chat, remove_student_from_group_chat
from apps.students.models import Student

from .models import Course, Group, GroupMembership, StudentTransfer
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
        if user.role in ("superadmin", "director", "branch_admin"):
            return qs
        if user.role == "teacher" and hasattr(user, "staff_profile"):
            return qs.filter(groups__teacher=user.staff_profile).distinct()
        if user.role == "support_teacher":
            from apps.staff.utils import get_support_teacher_group_ids
            group_ids = get_support_teacher_group_ids(user)
            return qs.filter(groups__id__in=group_ids).distinct()
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
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Group.objects.select_related("course", "branch", "teacher").all().order_by("name")
    serializer_class = GroupSerializer

    def get_permissions(self):
        if self.action == "add_student" and self.request.method == "GET":
            permission_classes = [permissions.IsAuthenticated]
        elif self.action in (
            "create",
            "update",
            "partial_update",
            "destroy",
            "add_student",
            "remove_student",
        ):
            permission_classes = [IsBranchAdmin]
        else:
            permission_classes = [permissions.IsAuthenticated]
        return [permission() for permission in permission_classes]

    def destroy(self, request, *args, **kwargs):
        from apps.finance.models import Payment
        from apps.lessons.models import Lesson
        from django.utils import timezone

        instance = self.get_object()
        force = request.query_params.get("force") == "true"

        active_students = instance.memberships.filter(left_at__isnull=True).count()
        payments_count = Payment.objects.filter(group=instance).count()

        if not force and (active_students > 0 or payments_count > 0):
            future_lessons = Lesson.objects.filter(
                group=instance,
                datetime__date__gte=timezone.now().date(),
                status__in=["scheduled", "in_progress"],
            ).count()
            return Response(
                {
                    "detail": {
                        "uz": f"Bu guruhda {active_students} faol o'quvchi, {future_lessons} kelajakdagi dars va {payments_count} to'lov mavjud",
                        "ru": f"В группе {active_students} активных студентов, {future_lessons} будущих уроков и {payments_count} платежей",
                    },
                    "active_students": active_students,
                    "future_lessons": future_lessons,
                    "payments_count": payments_count,
                },
                status=status.HTTP_409_CONFLICT,
            )

        # on_delete=CASCADE на Lesson.group — уроки удалятся автоматически
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

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
            if user.role == "teacher":
                scoped = scoped.filter(teacher=user.staff_profile)
        elif user.role == "support_teacher":
            from apps.staff.utils import get_support_teacher_group_ids
            group_ids = get_support_teacher_group_ids(user)
            scoped = qs.filter(id__in=group_ids)
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
    @action(detail=True, methods=["get", "post"], url_path="students")
    def add_student(self, request, pk=None):
        group = self.get_object()
        if request.method == "GET":
            from apps.students.serializers import StudentSerializer

            students = Student.objects.filter(
                group_memberships__group=group,
                group_memberships__left_at__isnull=True,
            ).select_related("user", "branch").distinct().order_by("user__full_name")
            return Response(StudentSerializer(students, many=True).data, status=status.HTTP_200_OK)

        serializer = GroupAddStudentSerializer(data=request.data, context={"group": group})
        serializer.is_valid(raise_exception=True)
        student = serializer.context["student"]

        if group.capacity:
            current_count = group.memberships.filter(left_at__isnull=True).count()
            if current_count >= group.capacity:
                return Response(
                    {
                        "detail": {
                            "uz": f"Guruh to'lgan ({current_count}/{group.capacity})",
                            "ru": f"Группа заполнена ({current_count}/{group.capacity})",
                        }
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

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

        # Студент может учиться в любом числе групп (разные курсы и даже
        # несколько групп одного курса). Дубль в этой же группе отсекается
        # проверкой active_exists выше.

        membership = GroupMembership.objects.create(
            group=group,
            student=student,
            enrolled_by=request.user,
        )
        add_student_to_group_chat(group, student)
        return Response(
            {
                "detail": {
                    "uz": "O'quvchi guruhga qo'shildi",
                    "ru": "Ученик добавлен в группу",
                },
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
                "detail": {
                    "uz": "O'quvchi guruhdan chiqarildi",
                    "ru": "Ученик удалён из группы",
                },
                "membership_id": str(membership.id),
            },
            status=status.HTTP_200_OK,
        )


class TransferInputSerializer(serializers.Serializer):
    student_id = serializers.UUIDField()
    from_group_id = serializers.UUIDField()
    to_group_id = serializers.UUIDField()
    transfer_date = serializers.DateField()
    reason = serializers.ChoiceField(
        choices=["schedule_change", "level_change", "branch_change", "student_request", "other"],
        default="other",
    )
    comment = serializers.CharField(required=False, allow_blank=True, default="")


class StudentTransferSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    from_group_name = serializers.CharField(source="from_group.name", read_only=True)
    to_group_name = serializers.CharField(source="to_group.name", read_only=True)
    from_branch_name = serializers.CharField(source="from_branch.name", read_only=True)
    to_branch_name = serializers.CharField(source="to_branch.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)

    class Meta:
        model = StudentTransfer
        fields = (
            "id", "student", "student_name",
            "from_group", "from_group_name",
            "to_group", "to_group_name",
            "from_branch", "from_branch_name",
            "to_branch", "to_branch_name",
            "transfer_date", "reason", "comment",
            "balance_at_transfer",
            "old_monthly_price", "new_monthly_price",
            "created_by_name", "created_at",
        )


class StudentTransferView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        """Выполнить перевод ученика."""
        if request.user.role not in ("director", "branch_admin", "superadmin"):
            return Response({"detail": "Permission denied"}, status=403)

        serializer = TransferInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            from apps.students.models import Student
            from apps.courses.models import Group
            from apps.courses.transfer_service import transfer_student

            student = Student.objects.get(id=data["student_id"])
            from_group = Group.objects.get(id=data["from_group_id"])
            to_group = Group.objects.get(id=data["to_group_id"])

            transfer = transfer_student(
                student=student,
                from_group=from_group,
                to_group=to_group,
                transfer_date=data["transfer_date"],
                reason=data["reason"],
                comment=data.get("comment", ""),
                created_by=request.user,
            )

            return Response(
                StudentTransferSerializer(transfer).data,
                status=status.HTTP_201_CREATED,
            )

        except Student.DoesNotExist:
            return Response({"detail": "Student not found"}, status=404)
        except Group.DoesNotExist:
            return Response({"detail": "Group not found"}, status=404)
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)

    def get(self, request):
        """История переводов."""
        qs = StudentTransfer.objects.select_related(
            "student", "from_group", "to_group",
            "from_branch", "to_branch", "created_by",
        )

        student_id = request.query_params.get("student_id")
        if student_id:
            qs = qs.filter(student_id=student_id)

        branch_id = request.query_params.get("branch_id")
        if branch_id:
            qs = qs.filter(
                Q(from_branch_id=branch_id) | Q(to_branch_id=branch_id)
            )

        return Response(StudentTransferSerializer(qs[:50], many=True).data)
