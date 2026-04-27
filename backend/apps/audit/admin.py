from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("timestamp", "user", "action", "entity_type", "entity_id")
    search_fields = ("user__full_name", "user__phone", "entity_type", "entity_id")
    list_filter = ("action", "entity_type")
