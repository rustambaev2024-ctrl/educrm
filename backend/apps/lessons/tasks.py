from datetime import date, datetime

from celery import shared_task

from apps.courses.models import Group

from .services import generate_lessons_for_group_sync


def _parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


@shared_task
def generate_lessons_for_group(group_id: str, from_date: str, to_date: str) -> int:
    group = Group.objects.select_related("teacher", "room").get(id=group_id)
    return generate_lessons_for_group_sync(
        group,
        from_date=_parse_date(from_date),
        to_date=_parse_date(to_date),
    )
