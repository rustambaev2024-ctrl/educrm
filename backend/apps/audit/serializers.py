from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actor_id = serializers.UUIDField(source="user.id", read_only=True)
    actor_name = serializers.CharField(source="user.full_name", read_only=True)

    class Meta:
        model = AuditLog
        fields = (
            "id",
            "actor_id",
            "actor_name",
            "user_role",
            "action",
            "entity_type",
            "entity_id",
            "ip_address",
            "user_agent",
            "timestamp",
        )
        read_only_fields = fields
