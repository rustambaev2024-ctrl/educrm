from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.chat.services import create_group_chat

from .models import Group


@receiver(post_save, sender=Group)
def on_group_created(sender, instance, created, **kwargs):
    if created:
        create_group_chat(instance)
