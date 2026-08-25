from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from apps.courses.models import GroupMembership
from apps.students.models import Student

from .models import Homework, HomeworkStatus

# R-20: ученик сдаёт работу, но не проверяет её.
# Единственное, что ему разрешено записывать в свой HomeworkStatus.
STUDENT_WRITABLE_FIELDS = frozenset({"status", "answer_text", "answer_file"})
# И единственный статус, который он может себе поставить.
STUDENT_ALLOWED_STATUSES = frozenset({"submitted"})


class HomeworkSerializer(serializers.ModelSerializer):
    class Meta:
        model = Homework
        fields = (
            "id",
            "title",
            "description",
            "file",
            "link",
            "deadline",
            "assign_type",
            "group",
            "lesson",
            "individual_student",
            "created_by",
            "created_at",
        )
        read_only_fields = ("id", "created_by", "created_at")

    def validate(self, attrs):
        assign_type = attrs.get("assign_type", getattr(self.instance, "assign_type", None))
        lesson = attrs.get("lesson")
        individual_student = attrs.get("individual_student")
        if assign_type == "lesson" and lesson is None:
            raise serializers.ValidationError(
                {"lesson": "Lesson is required for lesson assignment"}
            )
        if assign_type == "individual" and individual_student is None:
            raise serializers.ValidationError(
                {"individual_student": "Student is required for individual assignment"}
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        homework = Homework.objects.create(**validated_data)
        self._create_statuses(homework)
        return homework

    def _create_statuses(self, homework: Homework):
        if homework.assign_type == "individual":
            students = Student.objects.filter(id=homework.individual_student_id)
        else:
            memberships = GroupMembership.objects.filter(
                group=homework.group,
                left_at__isnull=True,
            ).select_related("student")
            students = [membership.student for membership in memberships]

        statuses = [
            HomeworkStatus(
                homework=homework,
                student=student,
                status="not_submitted",
            )
            for student in students
        ]
        HomeworkStatus.objects.bulk_create(statuses, ignore_conflicts=True)


class HomeworkStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = HomeworkStatus
        fields = (
            "id",
            "homework",
            "student",
            "status",
            "answer_text",
            "answer_file",
            "submitted_at",
            "grade",
            "teacher_comment",
            "checked_by",
            "checked_at",
        )
        read_only_fields = (
            "id",
            "homework",
            "student",
            "submitted_at",
            "checked_by",
            "checked_at",
        )

    def _enforce_student_scope(self, data):
        """R-20: ученик не может выставить себе оценку/статус проверки.

        Проверяется до валидации полей, чтобы попытка накрутки давала честный 403,
        а не 400 от валидатора значения.
        Легитимный путь остаётся открытым: PATCH со `status="submitted"`,
        `answer_text`, `answer_file` — сдача работы.
        """
        request = self.context.get("request")
        role = getattr(getattr(request, "user", None), "role", None)
        if role != "student" or not isinstance(data, dict):
            return

        writable = {name for name, field in self.fields.items() if not field.read_only}
        forbidden = sorted((writable - STUDENT_WRITABLE_FIELDS) & set(data))
        if forbidden:
            raise PermissionDenied({
                "detail": {
                    "uz": "O'quvchi o'ziga baho yoki izoh qo'ya olmaydi",
                    "ru": "Ученик не может выставлять себе оценку или комментарий",
                }
            })

        status_value = data.get("status")
        if status_value is not None and status_value not in STUDENT_ALLOWED_STATUSES:
            raise PermissionDenied({
                "detail": {
                    "uz": "O'quvchi faqat ishni topshira oladi",
                    "ru": "Ученик может только сдать работу",
                }
            })

    def run_validation(self, data=serializers.empty):
        self._enforce_student_scope(data)
        return super().run_validation(data)

    def validate(self, attrs):
        status_value = attrs.get("status", getattr(self.instance, "status", None))
        grade = attrs.get("grade", getattr(self.instance, "grade", None))
        if status_value == "checked" and grade is None:
            raise serializers.ValidationError({"grade": "Grade is required when status is checked"})
        return attrs

    def update(self, instance, validated_data):
        status_value = validated_data.get("status")
        if status_value == "submitted" and instance.submitted_at is None:
            validated_data["submitted_at"] = timezone.now()
        if status_value in ("checked", "revision"):
            validated_data["checked_at"] = timezone.now()
            validated_data["checked_by"] = self.context["request"].user
        return super().update(instance, validated_data)
