import logging

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Attendance

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Attendance)
def refund_charge_when_marked_excused(sender, instance, **kwargs):
    """Вернуть деньги, если уважительную причину отметили после списания.

    daily_lesson_charge пропускает учеников со статусом excused, но проверяет
    его только в момент списания — в 23:00. Учитель, отметивший причину на
    следующий день или исправивший отметку, деньги уже не возвращал: списание
    оставалось висеть.
    """
    if kwargs.get("raw"):
        return
    if instance.status != "excused" or not instance.lesson_id:
        return

    from apps.finance.models import Payment
    from apps.finance.services import reverse_payment

    charges = Payment.objects.filter(
        student_id=instance.student_id,
        lesson_id=instance.lesson_id,
        payment_type="charge",
    )
    for charge in charges:
        already_reversed = Payment.objects.filter(
            comment=f"Reversal of payment {charge.id}"
        ).exists()
        if already_reversed:
            continue
        try:
            with transaction.atomic():
                reverse_payment(charge)
        except Exception:
            # Возврат не должен ронять сохранение посещаемости — учитель
            # не поймёт, почему не сохранилась отметка.
            logger.exception(
                "Не удалось вернуть списание %s при отметке excused (ученик %s, урок %s)",
                charge.id,
                instance.student_id,
                instance.lesson_id,
            )
