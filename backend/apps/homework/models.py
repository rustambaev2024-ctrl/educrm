import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator
from django.db import models


class Homework(models.Model):
    ASSIGN_TYPE_CHOICES = [
        ("group", "Whole Group"),
        ("lesson", "For Lesson"),
        ("individual", "Individual Student"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    file = models.FileField(upload_to="homework_files/%Y/%m/", null=True, blank=True)
    link = models.URLField(blank=True)
    deadline = models.DateTimeField(null=True, blank=True)
    assign_type = models.CharField(max_length=20, choices=ASSIGN_TYPE_CHOICES)
    group = models.ForeignKey(
        "courses.Group",
        on_delete=models.CASCADE,
        related_name="homeworks",
    )
    lesson = models.ForeignKey(
        "lessons.Lesson",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="homeworks",
    )
    individual_student = models.ForeignKey(
        "students.Student",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="individual_homeworks",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "homework_homework"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title


class HomeworkStatus(models.Model):
    STATUS_CHOICES = [
        ("not_submitted", "Not Submitted"),
        ("submitted", "Submitted"),
        ("checked", "Checked"),
        ("revision", "Needs Revision"),
        ("overdue", "Overdue"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    homework = models.ForeignKey(
        Homework,
        on_delete=models.CASCADE,
        related_name="statuses",
    )
    student = models.ForeignKey(
        "students.Student",
        on_delete=models.CASCADE,
        related_name="homework_statuses",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="not_submitted")
    answer_text = models.TextField(blank=True)
    answer_file = models.FileField(upload_to="homework_answers/%Y/%m/", null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    grade = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MaxValueValidator(100)],
    )
    teacher_comment = models.TextField(blank=True)
    checked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="checked_homework_statuses",
    )
    checked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "homework_status"
        unique_together = ("homework", "student")
        ordering = ["-homework__created_at"]

    def __str__(self) -> str:
        return f"{self.homework_id}:{self.student_id}:{self.status}"
