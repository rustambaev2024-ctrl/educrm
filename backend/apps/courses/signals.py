from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from apps.chat.services import create_group_chat
from apps.lessons.services import generate_lessons_for_group_sync, resync_lessons_for_group

from .models import Group, GroupMembership


@receiver(pre_save, sender=Group)
def stash_old_schedule(sender, instance, **kwargs):
    """Snapshot the schedule before save so on_group_saved can tell whether
    it actually changed — post_save alone can't see the previous value."""
    if kwargs.get("raw") or not instance.pk:
        instance._old_schedule = None
        return
    try:
        instance._old_schedule = Group.objects.only("schedule").get(pk=instance.pk).schedule
    except Group.DoesNotExist:
        instance._old_schedule = None


@receiver(post_save, sender=Group)
def on_group_saved(sender, instance, created, **kwargs):
    if kwargs.get("raw"):
        return
    if created:
        create_group_chat(instance)
        generate_lessons_for_group_sync(instance)
        return

    old_schedule = getattr(instance, "_old_schedule", None)
    if old_schedule is not None and old_schedule != instance.schedule:
        resync_lessons_for_group(instance)


@receiver(post_save, sender=GroupMembership)
def on_membership_activated(sender, instance, **kwargs):
    """Студент, вступивший в группу после публикации ДЗ, должен получить
    HomeworkStatus для уже существующих групповых заданий — иначе его сдача
    некуда записаться. Идемпотентно (ignore_conflicts), покрывает вступление
    и реактивацию членства."""
    if kwargs.get("raw"):
        return
    if instance.left_at is not None:
        return

    from apps.homework.models import Homework, HomeworkStatus

    group_homework = Homework.objects.filter(group_id=instance.group_id).exclude(
        assign_type="individual"
    )
    existing_hw_ids = set(
        HomeworkStatus.objects.filter(
            student_id=instance.student_id,
            homework__in=group_homework,
        ).values_list("homework_id", flat=True)
    )
    to_create = [
        HomeworkStatus(
            homework=hw,
            student_id=instance.student_id,
            status="not_submitted",
        )
        for hw in group_homework
        if hw.id not in existing_hw_ids
    ]
    if to_create:
        HomeworkStatus.objects.bulk_create(to_create, ignore_conflicts=True)
