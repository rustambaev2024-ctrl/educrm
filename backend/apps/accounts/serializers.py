from django.db import connection
from django.utils import timezone
from drf_spectacular.utils import OpenApiTypes, extend_schema_field
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User


class UserSerializer(serializers.ModelSerializer):
    fullName = serializers.CharField(source="full_name")
    schemaName = serializers.SerializerMethodField()
    profileId = serializers.SerializerMethodField()
    teacherId = serializers.SerializerMethodField()
    studentId = serializers.SerializerMethodField()
    parentId = serializers.SerializerMethodField()
    branchId = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "fullName",
            "phone",
            "role",
            "photo",
            "language",
            "theme",
            "schemaName",
            "profileId",
            "teacherId",
            "studentId",
            "parentId",
            "branchId",
        )

    @extend_schema_field(OpenApiTypes.STR)
    def get_schemaName(self, obj):
        return connection.schema_name

    def _staff_profile(self, obj):
        return getattr(obj, "staff_profile", None)

    def _student_profile(self, obj):
        return getattr(obj, "student_profile", None)

    def _parent_profile(self, obj):
        return getattr(obj, "parent_profile", None)

    @extend_schema_field(OpenApiTypes.UUID)
    def get_profileId(self, obj):
        if obj.role in ("director", "admin", "branch_admin", "teacher"):
            profile = self._staff_profile(obj)
        elif obj.role == "student":
            profile = self._student_profile(obj)
        elif obj.role == "parent":
            profile = self._parent_profile(obj)
        else:
            profile = None
        return str(profile.id) if profile else None

    @extend_schema_field(OpenApiTypes.UUID)
    def get_teacherId(self, obj):
        if obj.role != "teacher":
            return None
        profile = self._staff_profile(obj)
        return str(profile.id) if profile else None

    @extend_schema_field(OpenApiTypes.UUID)
    def get_studentId(self, obj):
        profile = self._student_profile(obj)
        return str(profile.id) if profile else None

    @extend_schema_field(OpenApiTypes.UUID)
    def get_parentId(self, obj):
        profile = self._parent_profile(obj)
        return str(profile.id) if profile else None

    @extend_schema_field(OpenApiTypes.UUID)
    def get_branchId(self, obj):
        if obj.role in ("director", "admin", "branch_admin", "teacher"):
            profile = self._staff_profile(obj)
        elif obj.role == "student":
            profile = self._student_profile(obj)
        else:
            profile = None
        branch_id = getattr(profile, "branch_id", None)
        return str(branch_id) if branch_id else None


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["full_name"] = user.full_name
        token["schema_name"] = connection.schema_name
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        data["schemaName"] = connection.schema_name
        return data


class MeUpdateSerializer(serializers.ModelSerializer):
    fullName = serializers.CharField(source="full_name", required=False)

    class Meta:
        model = User
        fields = ("fullName", "photo", "language", "theme")


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Old password is incorrect")
        return value


class ResetPasswordSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_user_id(self, value):
        try:
            user = User.objects.get(id=value)
        except User.DoesNotExist as exc:
            raise serializers.ValidationError("User not found") from exc
        self.context["target_user"] = user
        return value


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


def create_user_session(user, refresh_jti, request):
    user.sessions.update_or_create(
        refresh_token_jti=refresh_jti,
        defaults={
            "is_active": True,
            "ip_address": request.META.get("REMOTE_ADDR"),
            "device_info": request.META.get("HTTP_USER_AGENT", "")[:500],
            "last_used": timezone.now(),
        },
    )
