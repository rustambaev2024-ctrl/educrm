import logging

from celery import shared_task
from django.utils import timezone
from django_tenants.utils import get_public_schema_name, get_tenant_model, schema_context

from .models import HomeworkStatus

logger = logging.getLogger(__name__)


def _iter_tenant_schemas():
    tenant_model = get_tenant_model()
    public = get_public_schema_name()
    for tenant in tenant_model.objects.exclude(schema_name=public).iterator():
        yield tenant.schema_name


def mark_overdue_in_current_schema(now=None) -> int:
    """Пометить просроченные работы в ТЕКУЩЕЙ организации."""
    now = now or timezone.now()
    return HomeworkStatus.objects.filter(
        status="not_submitted",
        homework__deadline__isnull=False,
        homework__deadline__lt=now,
    ).update(status="overdue")


@shared_task
def mark_overdue_homework():
    """Проставить «просрочено» несданным работам с истёкшим сроком.

    Задача НЕ обходила организации: данные домашних заданий лежат отдельно у
    каждого учебного центра, а задача работала в общей служебной области, где
    их нет вовсе. То есть запускалась каждую ночь и не помечала ничего и ни у
    кого — статус «просрочено» не появлялся никогда.
    """
    now = timezone.now()
    total = 0
    for schema in _iter_tenant_schemas():
        with schema_context(schema):
            updated = mark_overdue_in_current_schema(now)
            total += updated
            if updated:
                logger.info("mark_overdue_homework: %s работ в '%s'", updated, schema)
    return total
