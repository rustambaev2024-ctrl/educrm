from django.db import connection
from django.utils import timezone
from drf_spectacular.utils import OpenApiTypes, extend_schema_field
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User


def normalize_phone(value: str) -> str:
    value = (value or "").strip()
    has_plus = value.startswith("+")
    digits = "".join(ch for ch in value if ch.isdigit())
    if has_plus or digits.startswith("998"):
        return f"+{digits}"
    return digits


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
        if obj.role in ("director", "admin", "branch_admin", "teacher", "support_teacher"):
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
        if obj.role in ("director", "admin", "branch_admin", "teacher", "support_teacher"):
            profile = self._staff_profile(obj)
        elif obj.role == "student":
            profile = self._student_profile(obj)
        else:
            profile = None
        branch_id = getattr(profile, "branch_id", None)
        return str(branch_id) if branch_id else None


import logging as _logging
_logger = _logging.getLogger(__name__)


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["full_name"] = user.full_name
        token["schema_name"] = connection.schema_name
        return token

    def validate(self, attrs):
        if "phone" in attrs:
            attrs["phone"] = normalize_phone(attrs["phone"])

        _logger.error(f"[LOGIN DEBUG] schema before authenticate: {connection.schema_name}")
        _logger.error(f"[LOGIN DEBUG] phone being used: {attrs.get('phone')!r}")
        _logger.error(f"[LOGIN DEBUG] username_field: {self.username_field!r}")

        from django.contrib.auth import authenticate, get_user_model
        _User = get_user_model()
        try:
            direct_user = _User.objects.get(phone=attrs.get("phone"))
            _logger.error(f"[LOGIN DEBUG] direct ORM found: id={direct_user.id} is_active={direct_user.is_active} role={direct_user.role}")
            _logger.error(f"[LOGIN DEBUG] check_password result: {direct_user.check_password(attrs.get('password'))}")
        except _User.DoesNotExist:
            _logger.error(f"[LOGIN DEBUG] direct ORM: DoesNotExist for phone={attrs.get('phone')!r}")
        except Exception as e:
            _logger.error(f"[LOGIN DEBUG] direct ORM raised: {type(e).__name__}: {e}")

        auth_user = authenticate(
            request=self.context.get("request"),
            phone=attrs.get("phone"),
            password=attrs.get("password"),
        )
        _logger.error(f"[LOGIN DEBUG] authenticate() returned: {auth_user!r}")

        try:
            data = super().validate(attrs)
        except Exception as e:
            _logger.error(f"[LOGIN DEBUG] super().validate() raised: {type(e).__name__}: {e}")
            raise

        data["user"] = UserSerializer(self.user).data
        data["schemaName"] = connection.schema_name
        # Добавляем slug тенанта для фронтенда (URL-роутинг)
        try:
            from apps.tenants.models import Institution
            institution = Institution.objects.get(schema_name=connection.schema_name)
            data["tenantSlug"] = institution.slug
        except Exception:
            data["tenantSlug"] = None
        return data


class MeUpdateSerializer(serializers.ModelSerializer):
    fullName = serializers.CharField(source="full_name", required=False)
    phone = serializers.CharField(required=False)

    class Meta:
        model = User
        fields = ("fullName", "phone", "photo", "language", "theme")

    def validate_phone(self, value):
        from .serializers import normalize_phone
        return normalize_phone(value)



def _validate_strong_password(value: str) -> str:
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


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Old password is incorrect")
        return value

    def validate_new_password(self, value):
        return _validate_strong_password(value)


class ResetPasswordSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        return _validate_strong_password(value)

    def validate_user_id(self, value):
        try:
            user = User.objects.get(id=value)
        except User.DoesNotExist as exc:
            raise serializers.ValidationError("User not found") from exc
        request = self.context.get("request")
        actor = getattr(request, "user", None)
        if actor and actor.is_authenticated:
            if actor.role in ("admin", "branch_admin"):
                if user.role not in ("teacher", "student", "parent"):
                    raise serializers.ValidationError("You can reset only teacher, student and parent passwords")
                actor_branch = getattr(getattr(actor, "staff_profile", None), "branch_id", None)
                target_branch = getattr(getattr(user, "staff_profile", None), "branch_id", None)
                if user.role == "student":
                    target_branch = getattr(getattr(user, "student_profile", None), "branch_id", None)
                if user.role == "parent":
                    parent = getattr(user, "parent_profile", None)
                    if parent and not parent.children.filter(branch_id=actor_branch).exists():
                        raise serializers.ValidationError("Parent is not linked to your branch")
                    target_branch = actor_branch
                if actor_branch and target_branch and actor_branch != target_branch:
                    raise serializers.ValidationError("User is outside your branch")
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
