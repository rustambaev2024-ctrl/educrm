import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

app = Celery("educrm")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    "core-health-ping": {
        "task": "apps.core.tasks.health_ping",
        "schedule": crontab(minute="*/15"),
    },
    "update-debtor-statuses": {
        "task": "apps.finance.tasks.update_debtor_statuses",
        "schedule": crontab(hour=0, minute=5),
    },
    "mark-overdue-homework": {
        "task": "apps.homework.tasks.mark_overdue_homework",
        "schedule": crontab(hour=0, minute=10),
    },
}
