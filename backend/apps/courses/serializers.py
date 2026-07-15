from django.utils import timezone
from drf_spectacular.utils import OpenApiTypes, extend_schema_field
from rest_framework import serializers

from apps.institutions.models import Room
from apps.students.models import Student

from .models import Course, Group, GroupMembership


class CourseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = ("id", "name", "description", "created_by", "created_at")
        read_only_fields = ("id", "created_by", "created_at")


class GroupSerializer(serializers.ModelSerializer):
    active_students_count = serializers.SerializerMethodField()
    active_student_ids = serializers.SerializerMethodField()
    teacher_name = serializers.CharField(source="teacher.user.full_name", read_only=True)
    # Кабинет необязателен: админ филиала не может создавать кабинеты
    # (это функция директора) и не должен быть заблокирован при создании
    # группы (BUG-025).
    room = serializers.PrimaryKeyRelatedField(
        queryset=Room.objects.all(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Group
        fields = (
            "id",
            "name",
            "course",
            "branch",
            "teacher",
            "teacher_name",
            "room",
            "capacity",
            "start_date",
            "end_date",
            "monthly_price",
            "status",
            "schedule",
            "created_at",
            "active_students_count",
            "active_student_ids",
        )
        read_only_fields = ("id", "created_at", "active_students_count", "active_student_ids", "teacher_name")

    @extend_schema_field(OpenApiTypes.INT)
    def get_active_students_count(self, obj):
        return obj.memberships.filter(left_at__isnull=True).count()

    @extend_schema_field(serializers.ListField(child=serializers.UUIDField()))
    def get_active_student_ids(self, obj):
        return [
            str(student_id)
            for student_id in obj.memberships.filter(left_at__isnull=True).values_list(
                "student_id",
                flat=True,
            )
        ]


class GroupMembershipSerializer(serializers.ModelSerializer):
    class Meta:
        model = GroupMembership
        fields = ("id", "group", "student", "enrolled_at", "left_at", "enrolled_by")
        read_only_fields = ("id", "enrolled_at", "left_at", "enrolled_by")


class GroupAddStudentSerializer(serializers.Serializer):
    student_id = serializers.UUIDField()

    def validate_student_id(self, value):
        try:
            student = Student.objects.get(id=value)
        except Student.DoesNotExist as exc:
            raise serializers.ValidationError("Student not found") from exc
        self.context["student"] = student
        return value


class GroupRemoveStudentSerializer(serializers.Serializer):
    student_id = serializers.UUIDField()

    def close_membership(self, group, student):
        membership = GroupMembership.objects.filter(
            group=group,
            student=student,
            left_at__isnull=True,
        ).first()
        if membership is None:
            raise serializers.ValidationError("Student is not an active member of this group")
        membership.left_at = timezone.now()
        membership.save(update_fields=["left_at"])
        return membership
