from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.students.models import Student

from .models import Wallet


@receiver(post_save, sender=Student)
def ensure_wallet_for_student(sender, instance, created, **kwargs):
    if created:
        Wallet.objects.get_or_create(
            student=instance,
            defaults={"balance": instance.wallet_balance},
        )
