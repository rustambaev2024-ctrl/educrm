import uuid

from django.db import models


class Lesson(models.Model):
    STATUS_CHOICES = [
        ("scheduled", "Scheduled"),
        ("conducted", "Conducted"),
        ("cancelled", "Cancelled"),
        ("rescheduled", "Rescheduled"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(
        "courses.Group",
        on_delete=models.CASCADE,
        related_name="lessons",
    )
    datetime = models.DateTimeField()
    room = models.ForeignKey(
        "institutions.Room",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lessons",
    )
    teacher = models.ForeignKey(
        "staff.Staff",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lessons",
    )
    is_substitute = models.BooleanField(default=False)
    original_teacher = models.ForeignKey(
        "staff.Staff",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="substituted_lessons",
    )
    topic = models.CharField(max_length=500, blank=True)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="scheduled")
    cancel_reason = models.CharField(max_length=500, blank=True)
    rescheduled_to = models.OneToOneField(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rescheduled_from",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "lessons_lesson"
        ordering = ["datetime"]
        indexes = [
            models.Index(fields=["group", "datetime"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self) -> str:
        return f"{self.group.name} @ {self.datetime}"


class Attendance(models.Model):
    STATUS_CHOICES = [
        ("present", "Present"),
        ("absent", "Absent"),
        ("late", "Late"),
        ("excused", "Excused"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name="attendance")
    student = models.ForeignKey(
        "students.Student",
        on_delete=models.CASCADE,
        related_name="attendance",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES)
    late_minutes = models.PositiveIntegerField(null=True, blank=True)
    comment = models.CharField(max_length=500, blank=True)
    recorded_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    is_charged = models.BooleanField(default=False)
    recorded_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "lessons_attendance"
        unique_together = ("lesson", "student")
        indexes = [
            models.Index(fields=["student", "lesson"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self) -> str:
        return f"{self.lesson_id}:{self.student_id}={self.status}"
