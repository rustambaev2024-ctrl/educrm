from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.chat.services import create_group_chat
from apps.lessons.services import generate_lessons_for_group_sync

from .models import Group


@receiver(post_save, sender=Group)
def on_group_created(sender, instance, created, **kwargs):
    if created:
        create_group_chat(instance)
        generate_lessons_for_group_sync(instance)
