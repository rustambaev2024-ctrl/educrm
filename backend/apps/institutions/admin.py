from django.contrib import admin

from .models import Branch, Room


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ("name", "phone", "status", "created_at")
    search_fields = ("name", "phone")


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("name", "branch", "capacity", "is_active")
    search_fields = ("name", "branch__name")
