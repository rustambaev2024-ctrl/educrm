from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.courses.models import GroupMembership
from apps.students.models import Student

from .models import Homework, HomeworkStatus


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
