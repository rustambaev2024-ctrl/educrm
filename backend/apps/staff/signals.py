import logging

from django.db.models.signals import post_delete
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(post_delete, sender="staff.SupportTeacherLink")
def log_support_teacher_unlinked(sender, instance, **kwargs):
    try:
        st_name = instance.support_teacher.full_name
        teacher_name = instance.teacher.user.full_name
    except Exception:
        st_name = str(instance.support_teacher_id)
        teacher_name = str(instance.teacher_id)

    logger.info(
        "SupportTeacherLink removed: %s unlinked from teacher %s",
        st_name,
        teacher_name,
    )
