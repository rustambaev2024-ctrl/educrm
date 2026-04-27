from rest_framework import serializers

from .models import Exam, ExamResult, Grade


class GradeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Grade
        fields = (
            "id",
            "student",
            "group",
            "lesson",
            "homework_status",
            "exam",
            "grade_type",
            "score",
            "comment",
            "graded_by",
            "graded_at",
        )
        read_only_fields = ("id", "graded_by", "graded_at")


class ExamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Exam
        fields = ("id", "group", "name", "date", "max_score", "created_by", "created_at")
        read_only_fields = ("id", "created_by", "created_at")


class ExamResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamResult
        fields = (
            "id",
            "exam",
            "student",
            "score",
            "pass_status",
            "comment",
            "recorded_by",
            "recorded_at",
        )
        read_only_fields = ("id", "recorded_by", "recorded_at")
