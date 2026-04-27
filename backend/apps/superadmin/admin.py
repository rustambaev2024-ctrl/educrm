from django.contrib import admin

from .models import InstitutionActionLog, InstitutionNotice, SuperAdmin


@admin.register(SuperAdmin)
class SuperAdminAdmin(admin.ModelAdmin):
    list_display = ("phone", "full_name", "is_active", "created_at")
    search_fields = ("phone", "full_name")


@admin.register(InstitutionActionLog)
class InstitutionActionLogAdmin(admin.ModelAdmin):
    list_display = ("institution", "action", "actor_phone", "created_at")
    list_filter = ("action",)
    search_fields = ("institution__name", "actor_phone", "message")


@admin.register(InstitutionNotice)
class InstitutionNoticeAdmin(admin.ModelAdmin):
    list_display = ("institution", "title", "send_at", "created_at")
    search_fields = ("institution__name", "title", "body")

