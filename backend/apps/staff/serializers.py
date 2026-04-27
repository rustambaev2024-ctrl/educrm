from django.db import transaction
from rest_framework import serializers

from apps.accounts.models import User

from .models import Staff


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

    @transaction.atomic
    def create(self, validated_data):
        user_data = validated_data.pop("user")
        password = validated_data.pop("password", None) or "ChangeMe123"

        user = User.objects.create_user(
            phone=user_data["phone"],
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
