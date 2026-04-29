from django.db import transaction
from rest_framework import serializers

from apps.accounts.models import User

from .models import Staff


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
        choices=["director", "admin", "branch_admin", "teacher"],
    )
    password = serializers.CharField(write_only=True, required=False, min_length=8)

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
        )
        read_only_fields = ("id", "user_id")

    def validate_phone(self, value):
        return normalize_phone(value)

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
