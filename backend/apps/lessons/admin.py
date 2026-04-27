from django.contrib import admin

from .models import Attendance, Lesson


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = ("id", "group", "datetime", "teacher", "status", "is_substitute")
    list_filter = ("status", "is_substitute")
    search_fields = ("group__name", "teacher__user__full_name")


@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = ("id", "lesson", "student", "status", "late_minutes", "is_charged")
    list_filter = ("status", "is_charged")
    search_fields = ("student__user__full_name", "lesson__group__name")
