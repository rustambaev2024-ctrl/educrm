import logging
from datetime import date, datetime, timedelta

from celery import shared_task
from django_tenants.utils import get_public_schema_name, get_tenant_model, schema_context

from apps.courses.models import Group

from .services import generate_lessons_for_group_sync

logger = logging.getLogger(__name__)


def _parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def _iter_tenant_schemas():
    """Yield each non-public tenant schema name."""
    tenant_model = get_tenant_model()
    public = get_public_schema_name()
    for tenant in tenant_model.objects.exclude(schema_name=public).iterator():
        yield tenant.schema_name


@shared_task
def generate_lessons_for_group(group_id: str, from_date: str, to_date: str) -> int:
    group = Group.objects.select_related("teacher", "room").get(id=group_id)
    return generate_lessons_for_group_sync(
        group,
        from_date=_parse_date(from_date),
        to_date=_parse_date(to_date),
    )


@shared_task
def extend_lesson_horizons(horizon_days: int = 90) -> int:
    """Keep every active group's Lesson calendar ~horizon_days ahead.

    Lessons are only ever generated once, at group creation (see
    apps.courses.signals.on_group_saved) — nothing extended the horizon
    afterward. Any group older than ~90 days silently ran out of future
    lessons with no error anywhere (found on prod 2026-08-08: 9 of 36
    active groups in one branch had zero lessons past "today", teachers
    couldn't take attendance). This task re-runs the same idempotent
    generator (get_or_create keyed on group+datetime, so it's always safe
    to re-run) daily for every active/recruiting group in every tenant.
    """
    today = date.today()
    horizon_end = today + timedelta(days=horizon_days)
    total_created = 0

    for schema in _iter_tenant_schemas():
        with schema_context(schema):
            groups = Group.objects.filter(status__in=["active", "recruiting"]).exclude(schedule=[])
            for group in groups:
                try:
                    total_created += generate_lessons_for_group_sync(
                        group, from_date=today, to_date=horizon_end
                    )
                except Exception:
                    logger.exception(
                        "extend_lesson_horizons failed for group %s in schema %s", group.id, schema
                    )

    return total_created
