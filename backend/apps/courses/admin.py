from django.contrib import admin

from .models import Course, Group, GroupMembership


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "created_by", "created_at")
    search_fields = ("name",)


@admin.register(Group)
class GroupAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "course", "branch", "teacher", "status")
    list_filter = ("status", "branch")
    search_fields = ("name",)


@admin.register(GroupMembership)
class GroupMembershipAdmin(admin.ModelAdmin):
    list_display = ("id", "group", "student", "enrolled_at", "left_at")
    list_filter = ("group",)
