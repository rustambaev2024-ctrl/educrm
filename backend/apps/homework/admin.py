from django.contrib import admin

from .models import Homework, HomeworkStatus


@admin.register(Homework)
class HomeworkAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "group", "assign_type", "deadline", "created_at")
    list_filter = ("assign_type", "group")
    search_fields = ("title", "description")


@admin.register(HomeworkStatus)
class HomeworkStatusAdmin(admin.ModelAdmin):
    list_display = ("id", "homework", "student", "status", "grade", "submitted_at")
    list_filter = ("status",)
    search_fields = ("homework__title", "student__user__full_name")
