import logging

from celery import shared_task
from django.utils import timezone
from django_tenants.utils import get_public_schema_name, get_tenant_model, schema_context

from apps.notifications.sms import EskizSmsService

logger = logging.getLogger(__name__)


def _iter_tenant_schemas():
    tenant_model = get_tenant_model()
    public = get_public_schema_name()
    for tenant in tenant_model.objects.exclude(schema_name=public).iterator():
        yield tenant.schema_name


@shared_task
def lead_follow_up_reminder():
    """Daily 9:00 — remind admins about overdue lead follow-ups."""
    from apps.accounts.models import User
    from apps.notifications.services import NotificationService
    from apps.students.models import StudentLead

    today = timezone.now().date()
    for schema in _iter_tenant_schemas():
        with schema_context(schema):
            overdue_leads = StudentLead.objects.filter(
                next_follow_up__lte=today,
                status__in=["new", "contacted"],
            )
            if not overdue_leads.exists():
                continue
            count = overdue_leads.count()
            admins = list(User.objects.filter(role__in=["branch_admin", "director"]))
            if admins:
                NotificationService.notify(
                    recipients=admins,
                    notification_type="lead_follow_up",
                    title=f"{count} ta murojaat kutilmoqda",
                    body=f"Bugun bog'lanish kerak bo'lgan {count} ta murojaat mavjud",
                )
    logger.info("lead_follow_up_reminder completed")


@shared_task
def debtor_reminder():
    """Weekly Monday 10:00 — remind director about debtors."""
    from apps.accounts.models import User
    from apps.notifications.services import NotificationService
    from apps.students.models import Student

    for schema in _iter_tenant_schemas():
        with schema_context(schema):
            debtors = Student.objects.filter(wallet_balance__lt=0)
            if not debtors.exists():
                continue
            count = debtors.count()
            total_debt = sum(abs(d.wallet_balance) for d in debtors)
            directors = list(User.objects.filter(role="director"))
            if directors:
                NotificationService.notify(
                    recipients=directors,
                    notification_type="debtor_alert",
                    title=f"{count} ta qarzdor o'quvchi",
                    body=f"Jami qarz: {total_debt:,.0f} so'm",
                )
    logger.info("debtor_reminder completed")


@shared_task
def lesson_reminder():
    """Every 30 min — remind teacher about upcoming lesson."""
    from datetime import timedelta

    from apps.lessons.models import Lesson
    from apps.notifications.services import NotificationService

    now = timezone.now()
    window_start = now + timedelta(minutes=25)
    window_end = now + timedelta(minutes=35)

    for schema in _iter_tenant_schemas():
        with schema_context(schema):
            upcoming = Lesson.objects.filter(
                datetime__gte=window_start,
                datetime__lte=window_end,
                status="scheduled",
                teacher__isnull=False,
            ).select_related("teacher__user", "group")
            for lesson in upcoming:
                NotificationService.notify(
                    recipients=[lesson.teacher.user],
                    notification_type="lesson_reminder",
                    title="Dars 30 daqiqadan boshlanadi",
                    body=f"{lesson.group.name} · {lesson.datetime.strftime('%H:%M')}",
                    related_object_type="Lesson",
                    related_object_id=str(lesson.id),
                )
    logger.info("lesson_reminder completed")


@shared_task
def trial_lesson_reminder():
    """Every 30 min — remind admins/directors about a trial lesson starting in ~2 hours."""
    from datetime import timedelta

    from apps.accounts.models import User
    from apps.notifications.services import NotificationService
    from apps.students.models import StudentLead

    now = timezone.now()
    window_start = now + timedelta(hours=1, minutes=50)
    window_end = now + timedelta(hours=2, minutes=10)

    for schema in _iter_tenant_schemas():
        with schema_context(schema):
            upcoming = StudentLead.objects.filter(
                trial_lesson_date__gte=window_start,
                trial_lesson_date__lte=window_end,
                status="trial",
            ).select_related("trial_lesson_group")
            if not upcoming.exists():
                continue
            admins = list(User.objects.filter(role__in=["branch_admin", "director"]))
            if not admins:
                continue
            for lead in upcoming:
                group_name = lead.trial_lesson_group.name if lead.trial_lesson_group else ""
                NotificationService.notify(
                    recipients=admins,
                    notification_type="trial_lesson_reminder",
                    title="Sinov darsi 2 soatdan boshlanadi",
                    body=f"{lead.full_name} — {group_name} · {lead.trial_lesson_date.strftime('%H:%M')}",
                )
    logger.info("trial_lesson_reminder completed")


@shared_task
def homework_deadline_reminder():
    """Daily 18:00 — remind students about homework due tomorrow."""
    from datetime import timedelta

    from apps.courses.models import GroupMembership
    from apps.homework.models import Homework, HomeworkStatus
    from apps.notifications.services import NotificationService

    tomorrow = (timezone.now() + timedelta(days=1)).date()

    for schema in _iter_tenant_schemas():
        with schema_context(schema):
            due_homework = Homework.objects.filter(
                deadline__date=tomorrow,
            ).select_related("group")
            for hw in due_homework:
                members = GroupMembership.objects.filter(
                    group=hw.group, left_at__isnull=True
                ).select_related("student__user")
                for member in members:
                    already = HomeworkStatus.objects.filter(
                        homework=hw, student=member.student, status="submitted"
                    ).exists()
                    if not already:
                        NotificationService.notify(
                            recipients=[member.student.user],
                            notification_type="homework_deadline",
                            title="Ertaga topshirish muddati",
                            body=f"{hw.title} — ertaga topshirish kerak",
                            related_object_type="Homework",
                            related_object_id=str(hw.id),
                        )
    logger.info("homework_deadline_reminder completed")


@shared_task
def send_debtor_sms():
    """Еженедельно: SMS должникам и их родителям"""
    from apps.students.models import Student
    from apps.tenants.models import Institution

    for schema in _iter_tenant_schemas():
        with schema_context(schema):
            try:
                institution = Institution.objects.get(schema_name=schema)
            except Exception:
                continue
            if not institution.sms_enabled:
                continue
            debtors = Student.objects.filter(
                wallet_balance__lt=0,
                status="active",
            ).select_related("user")
            for student in debtors:
                if not student.user.phone:
                    continue
                balance = abs(student.wallet_balance)
                msg_uz = (
                    f"Hurmatli {student.user.full_name}, "
                    f"hisobingizda {balance:,.0f} so'm qarz mavjud. "
                    f"Iltimos, to'lovni amalga oshiring."
                )
                EskizSmsService.send_for_tenant(
                    institution=institution,
                    phone=student.user.phone,
                    message=msg_uz,
                    schema=schema,
                )
    logger.info("send_debtor_sms completed")


@shared_task
def send_trial_lesson_sms():
    """За день до пробного урока — SMS лиду"""
    from datetime import timedelta

    from apps.students.models import StudentLead
    from apps.tenants.models import Institution

    now = timezone.now()
    tomorrow_start = now + timedelta(hours=20)
    tomorrow_end = now + timedelta(hours=28)

    for schema in _iter_tenant_schemas():
        with schema_context(schema):
            try:
                institution = Institution.objects.get(schema_name=schema)
            except Exception:
                continue
            if not institution.sms_enabled:
                continue
            leads = StudentLead.objects.filter(
                trial_lesson_date__gte=tomorrow_start,
                trial_lesson_date__lte=tomorrow_end,
                status="trial",
            ).select_related("trial_lesson_group")
            for lead in leads:
                if not lead.phone:
                    continue
                group = lead.trial_lesson_group
                time_str = lead.trial_lesson_date.strftime("%d.%m %H:%M")
                group_name = group.name if group else ""
                msg = (
                    f"Hurmatli {lead.full_name}, "
                    f"ertaga {time_str} da sinov darsingiz bor. "
                    f"{group_name}. Sizni kutamiz!"
                )
                EskizSmsService.send_for_tenant(
                    institution=institution,
                    phone=lead.phone,
                    message=msg,
                    schema=schema,
                )
    logger.info("send_trial_lesson_sms completed")
