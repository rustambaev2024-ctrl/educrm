from django.db.models import Avg
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import IsSupportTeacher, IsTeacher

from .models import Exam, ExamResult, Grade
from .serializers import ExamResultSerializer, ExamSerializer, GradeSerializer
from .services import upsert_exam_grade


class GradeViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Grade.objects.select_related("student", "group", "lesson").all()
    serializer_class = GradeSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            permission_classes = [IsTeacher | IsSupportTeacher]
        else:
            permission_classes = [permissions.IsAuthenticated]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if user.role in ("superadmin", "director", "admin", "branch_admin"):
            scoped = qs
        elif user.role == "teacher" and hasattr(user, "staff_profile"):
            scoped = qs.filter(group__teacher_id=user.staff_profile.id)
        elif user.role == "support_teacher":
            from apps.staff.utils import get_support_teacher_group_ids
            group_ids = get_support_teacher_group_ids(user)
            scoped = qs.filter(group_id__in=group_ids)
        elif user.role == "student" and hasattr(user, "student_profile"):
            scoped = qs.filter(student=user.student_profile)
        elif user.role == "parent" and hasattr(user, "parent_profile"):
            scoped = qs.filter(student__parents=user.parent_profile)
        else:
            return qs.none()

        if self.request.query_params.get("group_id"):
            scoped = scoped.filter(group_id=self.request.query_params["group_id"])
        if self.request.query_params.get("student_id"):
            scoped = scoped.filter(student_id=self.request.query_params["student_id"])
        if self.request.query_params.get("grade_type"):
            scoped = scoped.filter(grade_type=self.request.query_params["grade_type"])
        return scoped.order_by("-graded_at")

    def perform_create(self, serializer):
        serializer.save(graded_by=self.request.user)

    @action(detail=False, methods=["get"], url_path=r"group/(?P<group_id>[0-9a-f-]+)/journal")
    def group_journal(self, request, group_id=None):
        grades = self.get_queryset().filter(group_id=group_id)
        serializer = GradeSerializer(grades, many=True)
        return Response(
            {"group_id": group_id, "grades": serializer.data},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path=r"student/(?P<student_id>[0-9a-f-]+)/average")
    def student_average(self, request, student_id=None):
        avg_value = self.get_queryset().filter(student_id=student_id).aggregate(
            avg=Avg("score")
        )["avg"]
        return Response(
            {
                "student_id": student_id,
                "average_score": round(float(avg_value), 2) if avg_value is not None else None,
            },
            status=status.HTTP_200_OK,
        )


class ExamViewSet(viewsets.ModelViewSet):
    queryset = Exam.objects.select_related("group").all().order_by("-date")
    serializer_class = ExamSerializer
    permission_classes = [IsTeacher]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if user.role in ("superadmin", "director", "admin", "branch_admin"):
            scoped = qs
        elif user.role == "teacher" and hasattr(user, "staff_profile"):
            scoped = qs.filter(group__teacher_id=user.staff_profile.id)
        else:
            return qs.none()

        if self.request.query_params.get("group_id"):
            scoped = scoped.filter(group_id=self.request.query_params["group_id"])
        return scoped

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"], url_path="results")
    def add_result(self, request, pk=None):
        exam = self.get_object()
        serializer = ExamResultSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        result, _ = ExamResult.objects.update_or_create(
            exam=exam,
            student=serializer.validated_data["student"],
            defaults={
                "score": serializer.validated_data["score"],
                "pass_status": serializer.validated_data["pass_status"],
                "comment": serializer.validated_data.get("comment", ""),
                "recorded_by": request.user,
            },
        )
        upsert_exam_grade(result)
        return Response(ExamResultSerializer(result).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["patch"], url_path=r"results/(?P<result_id>[0-9a-f-]+)")
    def update_result(self, request, pk=None, result_id=None):
        exam = self.get_object()
        result = ExamResult.objects.filter(id=result_id, exam=exam).first()
        if result is None:
            return Response({"detail": "Result not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = ExamResultSerializer(result, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        result = serializer.save(recorded_by=request.user)
        upsert_exam_grade(result)
        return Response(serializer.data, status=status.HTTP_200_OK)
