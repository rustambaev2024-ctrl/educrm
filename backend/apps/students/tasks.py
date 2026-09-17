"""Фоновая доставка статусов заявок в LeadPixel."""

import logging
from datetime import timedelta

from celery import shared_task
from django.core.cache import cache
from django.utils import timezone
from django_tenants.utils import get_public_schema_name, get_tenant_model, schema_context

from apps.students.lidpixel import MAX_ATTEMPTS, RETRY_SCHEDULE_MINUTES, send_status_event

logger = logging.getLogger(__name__)

BATCH_SIZE = 50


def deliver_pending_for_institution(institution):
    """Разносит готовые к отправке события одной организации.

    Вынесено из задачи отдельной функцией: обход тенантов на SQLite не
    работает, и без этого разделения логика повторов осталась бы без тестов —
    ровно та ошибка, которую уже ловили на ежедневных списаниях.
    """
    from apps.students.models import LeadStatusDelivery

    url = getattr(institution, "lidpixel_status_url", "")
    key = getattr(institution, "lidpixel_status_key", "")
    if not url:
        return 0

    due = LeadStatusDelivery.objects.filter(
        status="pending", next_attempt_at__lte=timezone.now()
    ).order_by("created_at")[:BATCH_SIZE]

    sent = 0
    for delivery in due:
        ok, code, error = send_status_event(url=url, key=key, payload=delivery.payload)
        delivery.attempts += 1
        delivery.response_code = code
        if ok:
            delivery.status = "sent"
            delivery.last_error = ""
            delivery.sent_at = timezone.now()
            sent += 1
        else:
            delivery.last_error = error or ""
            if delivery.attempts >= MAX_ATTEMPTS:
                delivery.status = "failed"
            else:
                minutes = RETRY_SCHEDULE_MINUTES[delivery.attempts - 1]
                delivery.next_attempt_at = timezone.now() + timedelta(minutes=minutes)
        delivery.save(
            update_fields=[
                "attempts",
                "response_code",
                "status",
                "last_error",
                "sent_at",
                "next_attempt_at",
            ]
        )
    return sent


@shared_task
def deliver_lead_statuses():
    """Обходит организации и отправляет накопившиеся события."""
    tenant_model = get_tenant_model()
    public = get_public_schema_name()
    for institution in tenant_model.objects.exclude(schema_name=public).iterator():
        if not getattr(institution, "lidpixel_status_url", ""):
            continue
        # Замок на схему: beat запускает задачу раз в минуту, а проход может
        # занять дольше — без замка два прогона отправили бы одни и те же
        # события дважды. Тот же приём, что у ежедневных списаний.
        lock_key = f"deliver_lead_statuses:{institution.schema_name}"
        if not cache.add(lock_key, "running", timeout=300):
            logger.warning(
                "deliver_lead_statuses уже выполняется для %s — пропускаем",
                institution.schema_name,
            )
            continue
        try:
            with schema_context(institution.schema_name):
                sent = deliver_pending_for_institution(institution)
            if sent:
                logger.info(
                    "deliver_lead_statuses: отправлено %s событий для %s",
                    sent,
                    institution.schema_name,
                )
        finally:
            cache.delete(lock_key)
