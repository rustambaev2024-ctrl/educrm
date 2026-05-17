from rest_framework import serializers

from apps.tenants.models import Institution

from .models import Branch, Room


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ("id", "name", "address", "phone", "status", "created_at")
        read_only_fields = ("id", "created_at")


class RoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = ("id", "branch", "name", "capacity", "is_active")
        read_only_fields = ("id",)


class InstitutionSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = Institution
        fields = ("meta_pixel_id", "meta_access_token")
