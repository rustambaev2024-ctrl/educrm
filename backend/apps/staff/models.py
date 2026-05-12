import uuid

from django.conf import settings
from django.db import models


class Staff(models.Model):
    STATUS_CHOICES = [
        ("active", "Active"),
        ("fired", "Fired"),
        ("vacation", "Vacation"),
        ("blocked", "Blocked"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="staff_profile",
    )
    branch = models.ForeignKey(
        "institutions.Branch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="staff",
    )
    passport_number = models.CharField(max_length=50, blank=True)
    hire_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")
    salary_percent = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    fixed_salary = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    class Meta:
        db_table = "staff_staff"

    def __str__(self):
        return self.user.full_name


class StaffPenalty(models.Model):
    STATUS_CHOICES = [
        ("active", "Active"),
        ("cancelled", "Cancelled"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    staff = models.ForeignKey(
        Staff,
        on_delete=models.CASCADE,
        related_name="penalties",
    )
    branch = models.ForeignKey(
        "institutions.Branch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="staff_penalties",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.CharField(max_length=255)
    penalty_date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")
    comment = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_staff_penalties",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "staff_penalty"
        ordering = ["-penalty_date", "-created_at"]
        indexes = [
            models.Index(fields=["staff", "penalty_date"]),
            models.Index(fields=["status", "penalty_date"]),
        ]

    def __str__(self):
        return f"{self.staff} - {self.amount}"
