from rest_framework import serializers

from apps.staff.models import Staff
from apps.students.models import Student

from .models import Attendance, Lesson


class LessonSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lesson
        fields = (
            "id",
            "group",
            "datetime",
            "room",
            "teacher",
            "is_substitute",
            "original_teacher",
            "topic",
            "notes",
            "status",
            "cancel_reason",
            "rescheduled_to",
            "created_at",
        )
        read_only_fields = ("id", "created_at", "is_substitute", "original_teacher")


class SubstituteTeacherSerializer(serializers.Serializer):
    teacher_id = serializers.UUIDField()

    def validate_teacher_id(self, value):
        try:
            staff = Staff.objects.get(id=value)
        except Staff.DoesNotExist as exc:
            raise serializers.ValidationError("Teacher not found") from exc
        self.context["teacher"] = staff
        return value


class AttendanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Attendance
        fields = (
            "id",
            "lesson",
            "student",
            "status",
            "late_minutes",
            "comment",
            "recorded_by",
            "is_charged",
            "recorded_at",
            "updated_at",
        )
        read_only_fields = ("id", "recorded_by", "is_charged", "recorded_at", "updated_at")

    def validate(self, attrs):
        status = attrs.get("status", getattr(self.instance, "status", None))
        late_minutes = attrs.get("late_minutes", getattr(self.instance, "late_minutes", None))
        if status == "late" and not late_minutes:
            raise serializers.ValidationError({"late_minutes": "Required when status is late"})
        if status != "late":
            attrs["late_minutes"] = None
        return attrs


class AttendanceRecordInputSerializer(serializers.Serializer):
    student_id = serializers.UUIDField()
    status = serializers.ChoiceField(choices=[choice[0] for choice in Attendance.STATUS_CHOICES])
    late_minutes = serializers.IntegerField(required=False, min_value=1)
    comment = serializers.CharField(required=False, allow_blank=True, max_length=500)

    def validate_student_id(self, value):
        if not Student.objects.filter(id=value).exists():
            raise serializers.ValidationError("Student not found")
        return value

    def validate(self, attrs):
        status = attrs["status"]
        late_minutes = attrs.get("late_minutes")
        if status == "late" and not late_minutes:
            raise serializers.ValidationError({"late_minutes": "Required when status is late"})
        if status != "late":
            attrs["late_minutes"] = None
        return attrs


class BulkAttendanceSerializer(serializers.Serializer):
    records = AttendanceRecordInputSerializer(many=True)
