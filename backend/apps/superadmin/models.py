import uuid

from django.db import models


class InstitutionActionLog(models.Model):
    ACTION_CHOICES = [
        ("create", "Create"),
        ("update", "Update"),
        ("delete", "Delete"),
        ("freeze", "Freeze"),
        ("unfreeze", "Unfreeze"),
        ("archive", "Archive"),
        ("notify", "Notify"),
        ("branch_create", "Branch Create"),
        ("branch_update", "Branch Update"),
        ("branch_delete", "Branch Delete"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institution = models.ForeignKey(
        "tenants.Institution",
        on_delete=models.CASCADE,
        related_name="superadmin_logs",
    )
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    message = models.TextField(blank=True)
    actor_id = models.CharField(max_length=50, blank=True)
    actor_phone = models.CharField(max_length=20, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "superadmin_institution_action_log"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["institution", "created_at"]),
            models.Index(fields=["action", "created_at"]),
        ]


class InstitutionNotice(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institution = models.ForeignKey(
        "tenants.Institution",
        on_delete=models.CASCADE,
        related_name="notices",
    )
    title = models.CharField(max_length=255)
    body = models.TextField()
    send_at = models.DateTimeField(null=True, blank=True)
    created_by_id = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "superadmin_institution_notice"
        ordering = ["-created_at"]


class PlatformSettings(models.Model):
    platform_name = models.CharField(max_length=255, default="EduCRM")
    support_email = models.EmailField(blank=True, default="support@educrm.uz")
    support_phone = models.CharField(max_length=50, blank=True, default="+998 71 200 00 00")
    default_language = models.CharField(max_length=10, default="uz")
    primary_color = models.CharField(max_length=7, default="#6366f1")
    session_timeout = models.IntegerField(default=30)
    require_2fa = models.BooleanField(default=False)
    strong_password = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "superadmin_platform_settings"

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(id=1)
        return obj

    def __str__(self):
        return self.platform_name

