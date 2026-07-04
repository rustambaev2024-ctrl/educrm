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


class SupportTeacherLink(models.Model):
    support_teacher = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="supported_teachers",
        limit_choices_to={"role": "support_teacher"},
    )
    teacher = models.ForeignKey(
        "staff.Staff",
        on_delete=models.CASCADE,
        related_name="support_teachers",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "staff_support_teacher_link"
        unique_together = [("support_teacher", "teacher")]

    def __str__(self):
        return f"{self.support_teacher.full_name} → {self.teacher.user.full_name}"


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


class StaffBonus(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    staff = models.ForeignKey(
        Staff,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bonuses",
    )
    branch = models.ForeignKey(
        "institutions.Branch", 
        on_delete=models.SET_NULL,
        null=True, 
        blank=True, 
        related_name="staff_bonuses"
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.CharField(max_length=255)
    bonus_date = models.DateField()
    comment = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL,
        null=True, 
        blank=True,
        related_name="created_staff_bonuses"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "staff_bonus"
        ordering = ["-bonus_date", "-created_at"]

    def __str__(self):
        return f"{self.staff} + {self.amount}"
