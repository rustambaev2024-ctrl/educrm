import uuid
from django.db import models
from django.conf import settings


class StudentTransfer(models.Model):
    """История переводов ученика между группами."""

    REASON_CHOICES = [
        ("schedule_change", "Schedule change"),
        ("level_change", "Level change"),
        ("branch_change", "Branch change"),
        ("student_request", "Student request"),
        ("other", "Other"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        "students.Student",
        on_delete=models.CASCADE,
        related_name="transfers",
    )
    from_group = models.ForeignKey(
        "courses.Group",
        on_delete=models.SET_NULL,
        null=True,
        related_name="transfers_out",
    )
    to_group = models.ForeignKey(
        "courses.Group",
        on_delete=models.SET_NULL,
        null=True,
        related_name="transfers_in",
    )
    from_branch = models.ForeignKey(
        "institutions.Branch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transfers_out",
    )
    to_branch = models.ForeignKey(
        "institutions.Branch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transfers_in",
    )
    transfer_date = models.DateField()
    reason = models.CharField(
        max_length=30,
        choices=REASON_CHOICES,
        default="other",
    )
    comment = models.TextField(blank=True)
    # Финансовый снимок на момент перевода
    balance_at_transfer = models.DecimalField(max_digits=12, decimal_places=2)
    old_monthly_price = models.DecimalField(max_digits=12, decimal_places=2)
    new_monthly_price = models.DecimalField(max_digits=12, decimal_places=2)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_transfers",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "student_transfers"
        ordering = ["-transfer_date", "-created_at"]
        indexes = [
            models.Index(fields=["student", "transfer_date"]),
        ]

    def __str__(self):
        return f"{self.student} → {self.to_group} ({self.transfer_date})"
