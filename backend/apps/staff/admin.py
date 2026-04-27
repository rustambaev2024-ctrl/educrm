from django.contrib import admin

from .models import Staff


@admin.register(Staff)
class StaffAdmin(admin.ModelAdmin):
    list_display = ("user", "branch", "status", "salary_percent")
    search_fields = ("user__full_name", "user__phone")
    list_filter = ("status",)
