import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models


class Student(models.Model):
    STATUS_CHOICES = [
        ("active", "Active"),
        ("frozen", "Frozen"),
        ("debtor", "Debtor"),
        ("archived", "Archived"),
        ("graduate", "Graduate"),
        ("expelled", "Expelled"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="student_profile",
    )
    branch = models.ForeignKey(
        "institutions.Branch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="students",
    )
    date_of_birth = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")
    wallet_balance = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    registered_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "students_student"
        ordering = ["-registered_at"]

    def __str__(self) -> str:
        return self.user.full_name


class Parent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="parent_profile",
    )
    children = models.ManyToManyField(
        Student,
        through="ParentStudentLink",
        related_name="parents",
    )

    class Meta:
        db_table = "students_parent"

    def __str__(self) -> str:
        return self.user.full_name


class ParentStudentLink(models.Model):
    parent = models.ForeignKey(Parent, on_delete=models.CASCADE)
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    linked_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "students_parent_student_link"
        unique_together = ("parent", "student")


class StudentDocument(models.Model):
    DOC_TYPE_CHOICES = [
        ("contract", "Contract"),
        ("passport", "Passport"),
        ("birth_cert", "Birth Certificate"),
        ("other", "Other"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="documents")
    doc_type = models.CharField(max_length=20, choices=DOC_TYPE_CHOICES)
    file = models.FileField(upload_to="student_docs/%Y/%m/")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "students_document"
        ordering = ["-uploaded_at"]


class Certificate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="certificates",
    )
    course = models.ForeignKey(
        "courses.Course",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    issued_at = models.DateField()
    file = models.FileField(upload_to="certificates/%Y/", null=True, blank=True)
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "students_certificate"
        ordering = ["-issued_at"]


class StudentLead(models.Model):
    STATUS_CHOICES = [
        ("new", "New"),
        ("contacted", "Contacted"),
        ("trial", "Trial lesson"),
        ("won", "Enrolled"),
        ("lost", "Lost"),
    ]
    SOURCE_CHOICES = [
        ("walk_in", "Walk-in"),
        ("phone", "Phone"),
        ("telegram", "Telegram"),
        ("instagram", "Instagram"),
        ("referral", "Referral"),
        ("other", "Other"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    full_name = models.CharField(max_length=255)
    phone = models.CharField(max_length=32)
    branch = models.ForeignKey(
        "institutions.Branch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="student_leads",
    )
    interested_course = models.ForeignKey(
        "courses.Course",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="student_leads",
    )
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default="walk_in")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="new")
    next_follow_up = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_student_leads",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "students_lead"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "next_follow_up"]),
            models.Index(fields=["phone"]),
        ]

    def __str__(self) -> str:
        return f"{self.full_name} ({self.phone})"


class ParentLinkCode(models.Model):
    student = models.OneToOneField(
        Student,
        on_delete=models.CASCADE,
        related_name="parent_link_code",
    )
    code = models.CharField(max_length=6, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)

    class Meta:
        db_table = "students_parent_link_code"

    @classmethod
    def generate_for_student(cls, student):
        import random
        import string
        from datetime import timedelta

        from django.utils import timezone

        code = "".join(random.choices(string.digits, k=6))
        obj, _ = cls.objects.update_or_create(
            student=student,
            defaults={
                "code": code,
                "expires_at": timezone.now() + timedelta(hours=24),
                "is_used": False,
            },
        )
        return obj

    def __str__(self):
        return f"{self.student} - {self.code}"
