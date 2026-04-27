import uuid

from django.db import models


class Branch(models.Model):
    STATUS_CHOICES = [
        ("active", "Active"),
        ("frozen", "Frozen"),
        ("archived", "Archived"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "institutions_branch"

    def __str__(self):
        return self.name


class Room(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="rooms")
    name = models.CharField(max_length=100)
    capacity = models.PositiveIntegerField(default=20)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "institutions_room"
        unique_together = ("branch", "name")

    def __str__(self):
        return f"{self.branch.name}: {self.name}"
