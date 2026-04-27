from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.finance.services import CHARGEABLE_ATTENDANCE_STATUSES
from apps.finance.tasks import charge_attendance

from .models import Attendance


@receiver(post_save, sender=Attendance)
def on_attendance_saved(sender, instance, created, **kwargs):
    if instance.status in CHARGEABLE_ATTENDANCE_STATUSES and not instance.is_charged:
        charge_attendance.delay(str(instance.id))
