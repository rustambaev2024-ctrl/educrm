import uuid

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models

from .managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    ROLE_CHOICES = [
        ("superadmin", "Superadmin"),
        ("director", "Director"),
        ("admin", "Branch Admin"),
        ("branch_admin", "Branch Admin"),
        ("teacher", "Teacher"),
        ("support_teacher", "Support Teacher"),
        ("student", "Student"),
        ("parent", "Parent"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone = models.CharField(max_length=20, unique=True)
    full_name = models.CharField(max_length=255)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    photo = models.ImageField(upload_to="avatars/", null=True, blank=True)
    language = models.CharField(max_length=5, default="uz")
    theme = models.CharField(
        max_length=10,
        default="light",
        choices=[("light", "Light"), ("dark", "Dark")],
    )
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(auto_now_add=True)

    USERNAME_FIELD = "phone"
    REQUIRED_FIELDS = ["full_name", "role"]

    objects = UserManager()

    class Meta:
        db_table = "accounts_user"

    def __str__(self):
        return f"{self.full_name} ({self.phone})"


class UserSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sessions")
    device_info = models.CharField(max_length=500, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    refresh_token_jti = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "accounts_user_session"
        ordering = ["-last_used"]
