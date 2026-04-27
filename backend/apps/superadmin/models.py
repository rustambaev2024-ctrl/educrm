import uuid

from django.db import models


class SuperAdmin(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone = models.CharField(max_length=20, unique=True)
    full_name = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "superadmin_super_admin"

    def __str__(self):
        return self.full_name


class InstitutionActionLog(models.Model):
    ACTION_CHOICES = [
        ("create", "Create"),
        ("freeze", "Freeze"),
        ("unfreeze", "Unfreeze"),
        ("archive", "Archive"),
        ("notify", "Notify"),
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

