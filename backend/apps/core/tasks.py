from celery import shared_task
from django.utils import timezone


@shared_task
def health_ping() -> str:
    return f"ok:{timezone.now().isoformat()}"
