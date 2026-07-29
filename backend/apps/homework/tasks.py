import logging

from celery import shared_task
from django.utils import timezone
from django_tenants.utils import get_public_schema_name, get_tenant_model, schema_context

from .models import HomeworkStatus

logger = logging.getLogger(__name__)


def _iter_tenant_schemas():
    """Yield each non-public tenant schema name."""
    tenant_model = get_tenant_model()
    public = get_public_schema_name()
    for tenant in tenant_model.objects.exclude(schema_name=public).iterator():
        yield tenant.schema_name


def mark_overdue_in_current_schema() -> int:
    """Перевести просроченные ДЗ в `overdue` в текущей схеме. Идемпотентно."""
    now = timezone.now()
    return HomeworkStatus.objects.filter(
        status="not_submitted",
        homework__deadline__isnull=False,
        homework__deadline__lt=now,
    ).update(status="overdue")


@shared_task(
    soft_time_limit=300,
    time_limit=360,
    autoretry_for=(Exception,),
    retry_backoff=True,
    max_retries=3,
)
def mark_overdue_homework():
    """R-25: задача не наследует схему из HTTP-запроса — ставим её явно по каждому тенанту.

    До этого запрос выполнялся в схеме `public`, где таблицы ДЗ нет: задача падала
    молча каждый день, статусы `overdue` не проставлялись ни в одном учебном центре.
    """
    for schema in _iter_tenant_schemas():
        logger.info(f"mark_overdue_homework started for schema '{schema}'")
        with schema_context(schema):
            updated = mark_overdue_in_current_schema()
        logger.info(
            f"mark_overdue_homework completed for schema '{schema}': {updated} statuses"
        )
