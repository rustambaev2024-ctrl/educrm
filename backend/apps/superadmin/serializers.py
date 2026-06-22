from django.db.models import Sum
from django.utils import timezone
from django.utils.text import slugify
from django_tenants.utils import schema_context
from drf_spectacular.utils import OpenApiTypes, extend_schema_field
from rest_framework import serializers

from apps.accounts.models import User
from apps.finance.models import Payment
from apps.institutions.models import Branch
from apps.staff.models import Staff
from apps.students.models import Student
from apps.tenants.models import Domain, Institution

from .models import InstitutionActionLog, InstitutionNotice


class InstitutionSerializer(serializers.ModelSerializer):
    domain = serializers.CharField(write_only=True, required=False, allow_blank=True)
    primary_domain = serializers.SerializerMethodField()
    director_phone = serializers.CharField(write_only=True, required=False, allow_blank=True)
    director_full_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    director_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    director_name = serializers.SerializerMethodField()
    director_login = serializers.SerializerMethodField()
    student_count = serializers.SerializerMethodField()
    branch_count = serializers.SerializerMethodField()
    staff_count = serializers.SerializerMethodField()
    monthly_revenue = serializers.SerializerMethodField()
    subscription_status = serializers.SerializerMethodField()
    notices_count = serializers.IntegerField(read_only=True, required=False)
    logs_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Institution
        fields = (
            "id",
            "name",
            "slug",
            "schema_name",
            "domain",
            "primary_domain",
            "logo",
            "address",
            "phone",
            "currency",
            "language",
            "status",
            "subscription_start",
            "subscription_end",
            "created_at",
            "director_phone",
            "director_full_name",
            "director_password",
            "director_name",
            "director_login",
            "student_count",
            "branch_count",
            "staff_count",
            "monthly_revenue",
            "subscription_status",
            "notices_count",
            "logs_count",
        )
        read_only_fields = (
            "id",
            "schema_name",
            "primary_domain",
            "created_at",
            "status",
            "director_name",
            "director_login",
            "student_count",
            "branch_count",
            "staff_count",
            "monthly_revenue",
            "subscription_status",
        )

    @extend_schema_field(OpenApiTypes.STR)
    def get_primary_domain(self, obj):
        domain = obj.domains.filter(is_primary=True).first()
        return domain.domain if domain else None

    def _with_tenant(self, obj, callback, default=None):
        try:
            with schema_context(obj.schema_name):
                return callback()
        except Exception:
            return default

    @extend_schema_field(OpenApiTypes.STR)
    def get_director_name(self, obj):
        return self._with_tenant(
            obj,
            lambda: User.objects.filter(role="director").order_by("date_joined").values_list(
                "full_name",
                flat=True,
            ).first(),
            None,
        )

    @extend_schema_field(OpenApiTypes.STR)
    def get_director_login(self, obj):
        return self._with_tenant(
            obj,
            lambda: User.objects.filter(role="director").order_by("date_joined").values_list(
                "phone",
                flat=True,
            ).first(),
            None,
        )

    @extend_schema_field(OpenApiTypes.INT)
    def get_student_count(self, obj):
        return self._with_tenant(obj, lambda: Student.objects.count(), 0)

    @extend_schema_field(OpenApiTypes.INT)
    def get_branch_count(self, obj):
        return self._with_tenant(obj, lambda: Branch.objects.count(), 0)

    @extend_schema_field(OpenApiTypes.INT)
    def get_staff_count(self, obj):
        return self._with_tenant(obj, lambda: Staff.objects.count(), 0)

    @extend_schema_field(OpenApiTypes.NUMBER)
    def get_monthly_revenue(self, obj):
        start_of_month = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return self._with_tenant(
            obj,
            lambda: str(
                Payment.objects.filter(
                    payment_type="top_up",
                    created_at__gte=start_of_month,
                ).aggregate(total=Sum("amount"))["total"] or 0
            ),
            "0.00",
        )

    @extend_schema_field(OpenApiTypes.STR)
    def get_subscription_status(self, obj):
        if not obj.subscription_end:
            return "no_subscription"
        days_left = (obj.subscription_end - timezone.now().date()).days
        if days_left < 0:
            return "expired"
        if days_left <= 7:
            return "expiring_soon"
        return "active"

    def validate_slug(self, value):
        normalized = slugify(value).replace("-", "_")
        if not normalized:
            raise serializers.ValidationError("Slug is required")
        if normalized == "public":
            raise serializers.ValidationError("Slug 'public' is reserved")
        if Institution.objects.filter(schema_name=normalized).exists():
            raise serializers.ValidationError(
                f"Organization with slug '{normalized}' already exists"
            )
        return normalized

    def create(self, validated_data):
        validated_data.pop("director_phone", None)
        validated_data.pop("director_full_name", None)
        validated_data.pop("director_password", None)
        domain = validated_data.pop("domain", "")
        validated_data["schema_name"] = validated_data["slug"]
        institution = Institution.objects.create(**validated_data)
        if domain:
            Domain.objects.create(tenant=institution, domain=domain, is_primary=True)
        return institution


class InstitutionNoticeSerializer(serializers.ModelSerializer):
    class Meta:
        model = InstitutionNotice
        fields = ("id", "institution", "title", "body", "send_at", "created_by_id", "created_at")
        read_only_fields = ("id", "institution", "created_by_id", "created_at")


class InstitutionActionLogSerializer(serializers.ModelSerializer):
    institution_name = serializers.CharField(source="institution.name", read_only=True)
    institution_schema = serializers.CharField(source="institution.schema_name", read_only=True)

    class Meta:
        model = InstitutionActionLog
        fields = (
            "id",
            "institution",
            "institution_name",
            "institution_schema",
            "action",
            "message",
            "actor_id",
            "actor_phone",
            "metadata",
            "created_at",
        )
        read_only_fields = fields


class PlatformSettingsSerializer(serializers.Serializer):
    platform_name = serializers.CharField(max_length=255, required=False)
    support_email = serializers.EmailField(required=False, allow_blank=True)
    support_phone = serializers.CharField(max_length=50, required=False, allow_blank=True)
    default_language = serializers.CharField(max_length=10, required=False)
    primary_color = serializers.CharField(max_length=7, required=False)
    session_timeout = serializers.IntegerField(required=False, min_value=5, max_value=480)
    require_2fa = serializers.BooleanField(required=False)
    strong_password = serializers.BooleanField(required=False)

    def update(self, instance, validated_data):
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        return instance
