from decimal import Decimal

from rest_framework import serializers

from apps.courses.models import Group
from apps.institutions.models import Branch
from apps.lessons.models import Lesson
from apps.staff.models import Staff
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
            "staff",
            "payment_type",
            "amount",
            "balance_before",
            "balance_after",
            "method",
            "category",
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
    student_id = serializers.UUIDField(required=False)
    payment_type = serializers.ChoiceField(choices=[
        "top_up", "discount", "refund", "charge", "expense",
        "manual_charge", "manual_top_up"
    ])
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    branch_id = serializers.UUIDField(required=False)
    group_id = serializers.UUIDField(required=False)
    lesson_id = serializers.UUIDField(required=False)
    staff_id = serializers.UUIDField(required=False)
    method = serializers.CharField(required=False, allow_blank=True, max_length=20)
    category = serializers.CharField(required=False, allow_blank=True, max_length=50)
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

    def validate_branch_id(self, value):
        try:
            branch = Branch.objects.get(id=value)
        except Branch.DoesNotExist as exc:
            raise serializers.ValidationError("Branch not found") from exc
        self.context["branch"] = branch
        return value

    def validate_lesson_id(self, value):
        if not Lesson.objects.filter(id=value).exists():
            raise serializers.ValidationError("Lesson not found")
        return value

    def validate_staff_id(self, value):
        try:
            staff = Staff.objects.get(id=value)
        except Staff.DoesNotExist as exc:
            raise serializers.ValidationError("Staff not found") from exc
        self.context["staff"] = staff
        return value

    def validate(self, attrs):
        payment_type = attrs.get("payment_type")
        request = self.context.get("request")
        user = getattr(request, "user", None)

        if payment_type == "expense":
            branch = self.context.get("branch")
            if branch is None and user is not None and hasattr(user, "staff_profile"):
                branch = user.staff_profile.branch
            if branch is None:
                raise serializers.ValidationError({"branch_id": "Branch is required for expenses."})
            if user is not None and user.role == "branch_admin":
                staff_branch_id = getattr(getattr(user, "staff_profile", None), "branch_id", None)
                if staff_branch_id and staff_branch_id != branch.id:
                    raise serializers.ValidationError({"branch_id": "You can create expenses only for your branch."})
            attrs["branch"] = branch
            return attrs

        if "student" not in self.context:
            raise serializers.ValidationError({"student_id": "Student is required for student payments."})
        return attrs

    def create(self, validated_data):
        if validated_data["payment_type"] == "expense":
            return Payment.objects.create(
                branch=validated_data["branch"],
                staff=self.context.get("staff"),
                payment_type="expense",
                amount=validated_data["amount"],
                balance_before=Decimal("0.00"),
                balance_after=Decimal("0.00"),
                method=validated_data.get("method", ""),
                category=validated_data.get("category", ""),
                comment=validated_data.get("comment", ""),
                created_by=self.context["request"].user,
            )

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
            method=validated_data.get("method", ""),
            category=validated_data.get("category", "tuition"),
            comment=validated_data.get("comment", ""),
        )
        return payment_result.payment
