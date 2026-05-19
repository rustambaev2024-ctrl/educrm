import uuid

from django.conf import settings
from django.db import models
from .transfers import StudentTransfer


class Course(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "courses_course"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Group(models.Model):
    STATUS_CHOICES = [
        ("recruiting", "Recruiting"),
        ("active", "Active"),
        ("frozen", "Frozen"),
        ("completed", "Completed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    course = models.ForeignKey(Course, on_delete=models.PROTECT, related_name="groups")
    branch = models.ForeignKey(
        "institutions.Branch",
        on_delete=models.CASCADE,
        related_name="groups",
    )
    teacher = models.ForeignKey(
        "staff.Staff",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="teaching_groups",
    )
    room = models.ForeignKey(
        "institutions.Room",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="groups",
    )
    capacity = models.PositiveIntegerField(default=15)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    monthly_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="recruiting")
    schedule = models.JSONField(default=list)
    students = models.ManyToManyField(
        "students.Student",
        through="GroupMembership",
        related_name="groups",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "courses_group"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class GroupMembership(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="memberships")
    student = models.ForeignKey(
        "students.Student",
        on_delete=models.CASCADE,
        related_name="group_memberships",
    )
    enrolled_at = models.DateTimeField(auto_now_add=True)
    left_at = models.DateTimeField(null=True, blank=True)
    enrolled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "courses_group_membership"
        ordering = ["-enrolled_at"]

    def __str__(self) -> str:
        return f"{self.student_id} -> {self.group_id}"

