from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.finance.services import CHARGEABLE_ATTENDANCE_STATUSES
from apps.finance.tasks import charge_attendance

from .models import Attendance


@receiver(post_save, sender=Attendance)
def on_attendance_saved(sender, instance, created, **kwargs):
    if instance.status in CHARGEABLE_ATTENDANCE_STATUSES and not instance.is_charged:
        # Railway currently runs only the web process. Execute the small wallet
        # charge after commit so attendance business rules do not depend on a
        # separate Celery worker being online.
        transaction.on_commit(lambda: charge_attendance(str(instance.id)))
