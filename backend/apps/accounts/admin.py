from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User, UserSession


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = ("phone", "full_name", "role", "is_active", "is_staff")
    ordering = ("phone",)
    search_fields = ("phone", "full_name")

    fieldsets = (
        (None, {"fields": ("phone", "password")}),
        (
            "Profile",
            {"fields": ("full_name", "role", "photo", "language", "theme")},
        ),
        (
            "Permissions",
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                )
            },
        ),
        ("Dates", {"fields": ("last_login", "date_joined")}),
    )

    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("phone", "full_name", "role", "password1", "password2"),
            },
        ),
    )


@admin.register(UserSession)
class UserSessionAdmin(admin.ModelAdmin):
    list_display = ("user", "refresh_token_jti", "ip_address", "last_used", "is_active")
    search_fields = ("user__phone", "user__full_name", "refresh_token_jti")
