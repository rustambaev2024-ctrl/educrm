from django.contrib import admin

from .models import Exam, ExamResult, Grade


@admin.register(Grade)
class GradeAdmin(admin.ModelAdmin):
    list_display = ("id", "student", "group", "grade_type", "score", "graded_at")
    list_filter = ("grade_type", "group")
    search_fields = ("student__user__full_name", "group__name")


@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "group", "date", "max_score")
    list_filter = ("group",)
    search_fields = ("name",)


@admin.register(ExamResult)
class ExamResultAdmin(admin.ModelAdmin):
    list_display = ("id", "exam", "student", "score", "pass_status", "recorded_at")
    list_filter = ("pass_status",)
    search_fields = ("student__user__full_name", "exam__name")
