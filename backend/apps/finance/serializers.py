from decimal import Decimal

from rest_framework import serializers

from apps.courses.models import Group
from apps.lessons.models import Lesson
from apps.students.models import Student

from .models import Payment
from .services import apply_payment, get_or_create_wallet


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = (
            "id",
            "student",
            "branch",
            "group",
            "lesson",
            "payment_type",
            "amount",
            "balance_before",
            "balance_after",
            "comment",
            "created_by",
            "created_at",
        )
        read_only_fields = (
            "id",
            "branch",
            "balance_before",
            "balance_after",
            "created_by",
            "created_at",
        )


class PaymentCreateSerializer(serializers.Serializer):
    student_id = serializers.UUIDField()
    payment_type = serializers.ChoiceField(choices=["top_up", "discount", "refund", "charge"])
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    group_id = serializers.UUIDField(required=False)
    lesson_id = serializers.UUIDField(required=False)
    comment = serializers.CharField(required=False, allow_blank=True, max_length=500)

    def validate_student_id(self, value):
        try:
            student = Student.objects.select_related("branch").get(id=value)
        except Student.DoesNotExist as exc:
            raise serializers.ValidationError("Student not found") from exc
        self.context["student"] = student
        return value

    def validate_group_id(self, value):
        if not Group.objects.filter(id=value).exists():
            raise serializers.ValidationError("Group not found")
        return value

    def validate_lesson_id(self, value):
        if not Lesson.objects.filter(id=value).exists():
            raise serializers.ValidationError("Lesson not found")
        return value

    def create(self, validated_data):
        student = self.context["student"]
        get_or_create_wallet(student)
        group = None
        lesson = None

        group_id = validated_data.get("group_id")
        if group_id:
            group = Group.objects.filter(id=group_id).first()
        lesson_id = validated_data.get("lesson_id")
        if lesson_id:
            lesson = Lesson.objects.filter(id=lesson_id).first()

        payment_result = apply_payment(
            student=student,
            payment_type=validated_data["payment_type"],
            amount=validated_data["amount"],
            created_by=self.context["request"].user,
            group=group,
            lesson=lesson,
            comment=validated_data.get("comment", ""),
        )
        return payment_result.payment
