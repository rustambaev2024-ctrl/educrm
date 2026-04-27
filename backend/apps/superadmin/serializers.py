from django.utils.text import slugify
from drf_spectacular.utils import OpenApiTypes, extend_schema_field
from rest_framework import serializers

from apps.tenants.models import Domain, Institution

from .models import InstitutionActionLog, InstitutionNotice


class InstitutionSerializer(serializers.ModelSerializer):
    domain = serializers.CharField(write_only=True, required=False, allow_blank=True)
    primary_domain = serializers.SerializerMethodField()
    director_phone = serializers.CharField(write_only=True, required=False, allow_blank=True)
    director_full_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    director_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
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
            "notices_count",
            "logs_count",
        )
        read_only_fields = ("id", "schema_name", "primary_domain", "created_at", "status")

    @extend_schema_field(OpenApiTypes.STR)
    def get_primary_domain(self, obj):
        domain = obj.domains.filter(is_primary=True).first()
        return domain.domain if domain else None

    def validate_slug(self, value):
        normalized = slugify(value).replace("-", "_")
        if not normalized:
            raise serializers.ValidationError("Slug is required")
        if normalized == "public":
            raise serializers.ValidationError("Slug public is reserved")
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
