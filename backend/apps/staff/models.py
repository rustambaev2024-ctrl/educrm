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

    class Meta:
        db_table = "staff_staff"

    def __str__(self):
        return self.user.full_name
