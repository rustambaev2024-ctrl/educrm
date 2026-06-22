from django.db import transaction
from rest_framework import serializers

from apps.accounts.models import User

from .models import Staff, StaffPenalty, StaffBonus, SupportTeacherLink

def normalize_phone(value: str) -> str:
    """Keep phone uniqueness stable for inputs with spaces/dashes."""
    if not value:
        return value
    value = str(value).strip()
    if value.startswith("+"):
        return "+" + "".join(ch for ch in value[1:] if ch.isdigit())
    return "".join(ch for ch in value if ch.isdigit())


class StaffSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(read_only=True, source="user.id")
    full_name = serializers.CharField(source="user.full_name")
    phone = serializers.CharField(source="user.phone")
    role = serializers.ChoiceField(
        source="user.role",
        choices=["director", "admin", "branch_admin", "teacher", "support_teacher"],
    )
    password = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = Staff
        fields = (
            "id",
            "user_id",
            "full_name",
            "phone",
            "role",
            "password",
            "branch",
            "passport_number",
            "hire_date",
            "status",
            "salary_percent",
            "fixed_salary",
        )
        read_only_fields = ("id", "user_id")

    def validate_phone(self, value):
        return normalize_phone(value)

    def validate_password(self, value):
        from apps.superadmin.models import PlatformSettings
        settings = PlatformSettings.get()
        if settings.strong_password:
            if len(value) < 8:
                raise serializers.ValidationError("Password must be at least 8 characters")
            if not any(c.isdigit() for c in value):
                raise serializers.ValidationError("Password must contain at least one digit")
            if not any(c.isupper() for c in value):
                raise serializers.ValidationError("Password must contain at least one uppercase letter")
        return value

    @transaction.atomic
    def create(self, validated_data):
        user_data = validated_data.pop("user")
        password = validated_data.pop("password", None) or "ChangeMe123"
        phone = normalize_phone(user_data["phone"])

        existing_user = User.objects.filter(phone=phone).first()
        if existing_user:
            if hasattr(existing_user, "staff_profile"):
                raise serializers.ValidationError(
                    {"phone": "Пользователь с этим телефоном уже является сотрудником."}
                )

            existing_user.full_name = user_data["full_name"]
            existing_user.role = user_data["role"]
            existing_user.set_password(password)
            existing_user.save(update_fields=["full_name", "role", "password"])
            return Staff.objects.create(user=existing_user, **validated_data)

        user = User.objects.create_user(
            phone=phone,
            full_name=user_data["full_name"],
            role=user_data["role"],
            password=password,
        )
        return Staff.objects.create(user=user, **validated_data)

    @transaction.atomic
    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", None)
        password = validated_data.pop("password", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if user_data:
            user = instance.user
            for attr, value in user_data.items():
                setattr(user, attr, value)
            if password:
                user.set_password(password)
            user.save()
        elif password:
            user = instance.user
            user.set_password(password)
            user.save(update_fields=["password"])

        return instance


class StaffPenaltySerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source="staff.user.full_name", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)

    class Meta:
        model = StaffPenalty
        fields = (
            "id",
            "staff",
            "staff_name",
            "branch",
            "branch_name",
            "amount",
            "reason",
            "penalty_date",
            "status",
            "comment",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "staff_name",
            "branch_name",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        )

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value

    def validate(self, attrs):
        staff = attrs.get("staff") or getattr(self.instance, "staff", None)
        branch = attrs.get("branch") or getattr(self.instance, "branch", None)
        if staff and branch and staff.branch_id and staff.branch_id != branch.id:
            raise serializers.ValidationError({"branch": "Penalty branch must match staff branch."})
        return attrs


class StaffBonusSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source="staff.user.full_name", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)

    class Meta:
        model = StaffBonus
        fields = (
            "id",
            "staff",
            "staff_name",
            "branch",
            "branch_name",
            "amount",
            "reason",
            "bonus_date",
            "comment",
            "created_by",
            "created_by_name",
            "created_at",
        )
        read_only_fields = (
            "id",
            "staff_name",
            "branch_name",
            "created_by",
            "created_by_name",
            "created_at",
        )

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value

    def validate(self, attrs):
        staff = attrs.get("staff") or getattr(self.instance, "staff", None)
        branch = attrs.get("branch") or getattr(self.instance, "branch", None)
        if staff and branch and staff.branch_id and staff.branch_id != branch.id:
            raise serializers.ValidationError({"branch": "Bonus branch must match staff branch."})
        return attrs


class SupportTeacherLinkSerializer(serializers.ModelSerializer):
    support_teacher_name = serializers.CharField(
        source="support_teacher.full_name", read_only=True
    )
    teacher_name = serializers.CharField(
        source="teacher.user.full_name", read_only=True
    )
    groups = serializers.SerializerMethodField()

    def get_groups(self, obj):
        from apps.courses.models import Group
        return list(
            Group.objects.filter(teacher=obj.teacher)
            .values("id", "name")
        )

    class Meta:
        model = SupportTeacherLink
        fields = [
            "id", "support_teacher", "support_teacher_name",
            "teacher", "teacher_name", "groups", "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate_support_teacher(self, value):
        if value.role != "support_teacher":
            raise serializers.ValidationError(
                "Выбранный пользователь не является помощником учителя."
            )
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        support_teacher = attrs.get("support_teacher") or getattr(self.instance, "support_teacher", None)
        teacher = attrs.get("teacher") or getattr(self.instance, "teacher", None)
        user = getattr(request, "user", None)

        # Проверка совпадения филиалов support_teacher и teacher
        if support_teacher and teacher:
            st_branch_id = getattr(
                getattr(support_teacher, "staff_profile", None), "branch_id", None
            )
            if st_branch_id and teacher.branch_id and st_branch_id != teacher.branch_id:
                raise serializers.ValidationError({
                    "detail": {
                        "uz": "Yordamchi o'qituvchi va o'qituvchi bir filialdan bo'lishi kerak",
                        "ru": "Помощник и учитель должны быть из одного филиала",
                    }
                })

        # admin/branch_admin может привязывать только учителей своего филиала.
        if user and user.role in ("admin", "branch_admin"):
            admin_branch_id = getattr(
                getattr(user, "staff_profile", None), "branch_id", None
            )
            if not admin_branch_id:
                raise serializers.ValidationError(
                    {"teacher": "У администратора не задан филиал."}
                )
            if teacher and teacher.branch_id != admin_branch_id:
                raise serializers.ValidationError(
                    {"teacher": "Учитель относится к другому филиалу."}
                )
        return attrs
