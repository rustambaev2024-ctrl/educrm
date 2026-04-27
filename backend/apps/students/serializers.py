from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import OpenApiTypes, extend_schema_field
from rest_framework import serializers

from apps.accounts.models import User

from .models import Certificate, Parent, ParentStudentLink, Student, StudentDocument


class StudentSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(read_only=True, source="user.id")
    full_name = serializers.CharField(source="user.full_name")
    phone = serializers.CharField(source="user.phone")
    password = serializers.CharField(write_only=True, required=False, min_length=8)
    parent_full_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    parent_phone = serializers.CharField(write_only=True, required=False, allow_blank=True)
    parent_password = serializers.CharField(write_only=True, required=False, allow_blank=True, min_length=8)
    group_ids = serializers.SerializerMethodField()
    parent_id = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = (
            "id",
            "user_id",
            "full_name",
            "phone",
            "password",
            "parent_full_name",
            "parent_phone",
            "parent_password",
            "branch",
            "date_of_birth",
            "status",
            "wallet_balance",
            "registered_at",
            "notes",
            "group_ids",
            "parent_id",
        )
        read_only_fields = ("id", "user_id", "wallet_balance", "registered_at", "group_ids", "parent_id")

    @extend_schema_field(serializers.ListField(child=serializers.UUIDField()))
    def get_group_ids(self, obj):
        return [
            str(group_id)
            for group_id in obj.group_memberships.filter(left_at__isnull=True).values_list(
                "group_id",
                flat=True,
            )
        ]

    @extend_schema_field(OpenApiTypes.UUID)
    def get_parent_id(self, obj):
        parent = obj.parents.first()
        return str(parent.id) if parent else None

    @transaction.atomic
    def create(self, validated_data):
        user_data = validated_data.pop("user")
        password = validated_data.pop("password", None) or "ChangeMe123"
        parent_full_name = validated_data.pop("parent_full_name", "")
        parent_phone = validated_data.pop("parent_phone", "")
        parent_password = validated_data.pop("parent_password", "") or "ChangeMe123"
        user = User.objects.create_user(
            phone=user_data["phone"],
            full_name=user_data["full_name"],
            role="student",
            password=password,
        )
        student = Student.objects.create(user=user, **validated_data)

        if parent_full_name and parent_phone:
            parent_user, created = User.objects.get_or_create(
                phone=parent_phone,
                defaults={
                    "full_name": parent_full_name,
                    "role": "parent",
                },
            )
            if created:
                parent_user.set_password(parent_password)
                parent_user.save(update_fields=["password"])
            parent, _ = Parent.objects.get_or_create(user=parent_user)
            ParentStudentLink.objects.get_or_create(parent=parent, student=student)

        return student

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


class StudentDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentDocument
        fields = ("id", "student", "doc_type", "file", "uploaded_by", "uploaded_at")
        read_only_fields = ("id", "student", "uploaded_by", "uploaded_at")


class CertificateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Certificate
        fields = ("id", "student", "course", "issued_at", "file", "issued_by")
        read_only_fields = ("id", "student", "issued_by")

    def validate(self, attrs):
        attrs.setdefault("issued_at", timezone.localdate())
        return attrs


class ParentSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(read_only=True, source="user.id")
    full_name = serializers.CharField(source="user.full_name")
    phone = serializers.CharField(source="user.phone")
    children_ids = serializers.SerializerMethodField()

    class Meta:
        model = Parent
        fields = ("id", "user_id", "full_name", "phone", "children_ids")
        read_only_fields = ("id", "user_id")

    @extend_schema_field(serializers.ListField(child=serializers.UUIDField()))
    def get_children_ids(self, obj):
        return [str(child_id) for child_id in obj.children.values_list("id", flat=True)]


class ParentStudentLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParentStudentLink
        fields = ("parent", "student", "linked_at")
        read_only_fields = ("linked_at",)
