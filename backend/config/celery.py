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
    "daily-lesson-charge": {
        "task": "apps.finance.tasks.daily_lesson_charge",
        "schedule": crontab(hour=23, minute=0),
    },
    "update-debtor-statuses": {
        "task": "apps.finance.tasks.update_debtor_statuses",
        "schedule": crontab(hour=0, minute=5),
    },
    "mark-overdue-homework": {
        "task": "apps.homework.tasks.mark_overdue_homework",
        "schedule": crontab(hour=0, minute=10),
    },
    "send-debtor-sms": {
        "task": "apps.notifications.tasks.send_debtor_sms",
        "schedule": crontab(hour=10, minute=0, day_of_week=1),
    },
    "send-trial-lesson-sms": {
        "task": "apps.notifications.tasks.send_trial_lesson_sms",
        "schedule": crontab(hour=9, minute=0),
    },
}
