from celery import shared_task
from django.utils import timezone

from .models import HomeworkStatus


@shared_task
def mark_overdue_homework():
    now = timezone.now()
    statuses = HomeworkStatus.objects.filter(
        status="not_submitted",
        homework__deadline__isnull=False,
        homework__deadline__lt=now,
    )
    statuses.update(status="overdue")
