from django.contrib import admin

from .models import Staff, StaffPenalty


@admin.register(Staff)
class StaffAdmin(admin.ModelAdmin):
    list_display = ("user", "branch", "status", "salary_percent")
    search_fields = ("user__full_name", "user__phone")
    list_filter = ("status",)


@admin.register(StaffPenalty)
class StaffPenaltyAdmin(admin.ModelAdmin):
    list_display = ("staff", "amount", "penalty_date", "status", "branch")
    search_fields = ("staff__user__full_name", "staff__user__phone", "reason")
    list_filter = ("status", "penalty_date", "branch")
