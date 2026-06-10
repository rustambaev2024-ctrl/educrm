import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator
from django.db import models


class Grade(models.Model):
    GRADE_TYPE_CHOICES = [
        ("lesson", "Lesson Grade"),
        ("homework", "Homework Grade"),
        ("exam", "Exam Grade"),
        ("activity", "Activity Grade"),
        ("speaking", "Speaking Grade"),
        ("vocabulary", "Vocabulary Grade"),
        ("test", "Test Grade"),
        ("extra_lesson", "Extra Lesson Grade"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        "students.Student",
        on_delete=models.CASCADE,
        related_name="grades",
    )
    group = models.ForeignKey(
        "courses.Group",
        on_delete=models.CASCADE,
        related_name="grades",
    )
    lesson = models.ForeignKey(
        "lessons.Lesson",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="grades",
    )
    homework_status = models.OneToOneField(
        "homework.HomeworkStatus",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="grade_record",
    )
    exam = models.ForeignKey(
        "Exam",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="grades",
    )
    grade_type = models.CharField(max_length=20, choices=GRADE_TYPE_CHOICES)
    score = models.PositiveSmallIntegerField(validators=[MaxValueValidator(100)])
    comment = models.CharField(max_length=500, blank=True)
    graded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    graded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "grades_grade"
        ordering = ["-graded_at"]
        indexes = [models.Index(fields=["student", "group"])]


class Exam(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(
        "courses.Group",
        on_delete=models.CASCADE,
        related_name="exams",
    )
    name = models.CharField(max_length=255)
    date = models.DateField()
    max_score = models.PositiveSmallIntegerField(default=100)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "grades_exam"
        ordering = ["-date"]


class ExamResult(models.Model):
    PASS_STATUS_CHOICES = [("passed", "Passed"), ("failed", "Failed")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name="results")
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE)
    score = models.PositiveSmallIntegerField()
    pass_status = models.CharField(max_length=10, choices=PASS_STATUS_CHOICES)
    comment = models.CharField(max_length=500, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "grades_exam_result"
        unique_together = ("exam", "student")
        ordering = ["-recorded_at"]
