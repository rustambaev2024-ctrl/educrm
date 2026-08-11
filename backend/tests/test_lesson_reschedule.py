"""
Перенос и отмена урока: деньги и календарь.

Правило центра: деньги списываются за каждое занятие, кроме случаев, когда
урок отменён, перенесён или у ученика уважительная причина. До августа 2026
из трёх исключений работало только последнее:

  * отменили урок после ночного списания — деньги оставались списанными;
  * перенесли урок — платили дважды, за старую дату и за новую;
  * правка расписания группы стирала урок, созданный переносом, — занятие
    молча исчезало из календаря, а у старого урока оставалась метка
    «перенесён» и указатель в никуда.
"""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.courses.models import Group, GroupMembership
from apps.finance.models import Payment
from apps.finance.services import apply_payment, refund_lesson_charges
from apps.lessons.models import Lesson
from apps.lessons.services import resync_lessons_for_group
from tests.factories import (
    BranchFactory,
    CourseFactory,
    StaffFactory,
    StudentFactory,
)

pytestmark = pytest.mark.django_db


def _group_with_student():
    branch = BranchFactory()
    group = Group.objects.create(
        name="G",
        course=CourseFactory(),
        branch=branch,
        teacher=StaffFactory(branch=branch),
        status="active",
        monthly_price=Decimal("600000.00"),
        start_date=timezone.localdate(),
        schedule=[{"day": 1, "start": "10:00"}],
    )
    student = StudentFactory(branch=branch, wallet_balance=Decimal("0.00"))
    GroupMembership.objects.create(group=group, student=student)
    return group, student


def _charged_lesson(group, student, *, days_ahead=0):
    lesson = Lesson.objects.create(
        group=group,
        teacher=group.teacher,
        datetime=timezone.now() + timedelta(days=days_ahead),
        status="scheduled",
    )
    apply_payment(
        student=student,
        payment_type="charge",
        amount=Decimal("50000.00"),
        group=group,
        lesson=lesson,
        comment="Daily lesson charge for test",
        suppress_notifications=True,
    )
    student.refresh_from_db()
    assert student.wallet_balance == Decimal("-50000.00")
    return lesson


# ─────────────── Деньги возвращаются ───────────────


def test_refund_returns_money_for_a_lesson_that_did_not_happen():
    group, student = _group_with_student()
    lesson = _charged_lesson(group, student)

    refunded = refund_lesson_charges(lesson)

    student.refresh_from_db()
    assert refunded == 1
    assert student.wallet_balance == Decimal("0.00")
    assert Payment.objects.filter(student=student, payment_type="refund").count() == 1


def test_refund_is_idempotent():
    """Отменить и следом перенести — деньги не должны вернуться дважды."""
    group, student = _group_with_student()
    lesson = _charged_lesson(group, student)

    refund_lesson_charges(lesson)
    second = refund_lesson_charges(lesson)

    student.refresh_from_db()
    assert second == 0
    assert student.wallet_balance == Decimal("0.00")


def test_refund_touches_only_this_lesson():
    group, student = _group_with_student()
    kept = _charged_lesson(group, student)
    student.refresh_from_db()
    moved = Lesson.objects.create(
        group=group, teacher=group.teacher, datetime=timezone.now() + timedelta(days=1)
    )
    apply_payment(
        student=student,
        payment_type="charge",
        amount=Decimal("50000.00"),
        group=group,
        lesson=moved,
        suppress_notifications=True,
    )

    refund_lesson_charges(moved)

    student.refresh_from_db()
    assert student.wallet_balance == Decimal("-50000.00"), (
        "вернуть надо только за перенесённый урок, списание за оставшийся не трогаем"
    )
    assert Payment.objects.filter(lesson=kept, payment_type="charge").exists()


def test_refund_does_nothing_when_nothing_was_charged():
    group, student = _group_with_student()
    lesson = Lesson.objects.create(
        group=group, teacher=group.teacher, datetime=timezone.now()
    )

    assert refund_lesson_charges(lesson) == 0
    student.refresh_from_db()
    assert student.wallet_balance == Decimal("0.00")


# ─────────────── Перенос переживает правку расписания ───────────────


def test_rescheduled_lesson_survives_a_schedule_edit():
    group, _ = _group_with_student()
    original = Lesson.objects.create(
        group=group,
        teacher=group.teacher,
        datetime=timezone.now() + timedelta(days=2),
        status="scheduled",
    )
    moved_to = Lesson.objects.create(
        group=group,
        teacher=group.teacher,
        datetime=timezone.now() + timedelta(days=3),
        status="scheduled",
    )
    original.status = "rescheduled"
    original.rescheduled_to = moved_to
    original.save(update_fields=["status", "rescheduled_to"])

    # Администратор поправил расписание группы.
    group.schedule = [{"day": 3, "start": "12:00"}]
    resync_lessons_for_group(group)

    moved_to.refresh_from_db()
    original.refresh_from_db()
    assert Lesson.objects.filter(id=moved_to.id).exists(), (
        "урок, созданный переносом, стоит вне расписания и не должен исчезать "
        "при его правке"
    )
    assert original.rescheduled_to_id == moved_to.id, (
        "указатель на перенесённый урок обязан остаться целым"
    )


def test_ordinary_future_lessons_are_still_rebuilt_on_a_schedule_edit():
    """Опорная точка: пересборка расписания должна продолжать работать."""
    group, _ = _group_with_student()
    stale = Lesson.objects.create(
        group=group,
        teacher=group.teacher,
        datetime=timezone.now() + timedelta(days=2),
        status="scheduled",
    )

    group.schedule = [{"day": 3, "start": "12:00"}]
    resync_lessons_for_group(group)

    assert not Lesson.objects.filter(id=stale.id).exists(), (
        "обычный будущий урок по старому расписанию обязан быть удалён"
    )


def test_history_is_never_touched_by_a_schedule_edit():
    group, _ = _group_with_student()
    conducted = Lesson.objects.create(
        group=group,
        teacher=group.teacher,
        datetime=timezone.now() + timedelta(days=2),
        status="conducted",
    )
    cancelled = Lesson.objects.create(
        group=group,
        teacher=group.teacher,
        datetime=timezone.now() + timedelta(days=4),
        status="cancelled",
    )

    group.schedule = [{"day": 3, "start": "12:00"}]
    resync_lessons_for_group(group)

    assert Lesson.objects.filter(id=conducted.id).exists()
    assert Lesson.objects.filter(id=cancelled.id).exists()


# ─────────────── Проверки при переносе ───────────────


def _reschedule(client, lesson, when):
    return client.post(
        f"/api/v1/lessons/{lesson.id}/reschedule/",
        {"datetime": when.isoformat()},
        format="json",
    )


def _admin_for(api_client, branch):
    """Администратор филиала: урок виден только в своём филиале."""
    from apps.accounts.models import User
    from apps.staff.models import Staff

    user = User.objects.create_user(
        phone="+998901234501", full_name="Admin", role="branch_admin", password="secret123"
    )
    Staff.objects.create(user=user, branch=branch, status="active")
    resp = api_client.post(
        "/api/v1/auth/login/", {"phone": user.phone, "password": "secret123"}, format="json"
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.json()['access']}")
    return api_client


def test_cannot_reschedule_into_the_past(api_client):
    """
    Урок, поставленный задним числом, пропускает ночное списание (оно идёт по
    сегодняшнему дню) и уже не может получить посещаемость — занятие просто
    исчезает. Раньше дата не проверялась вообще.
    """
    group, _ = _group_with_student()
    admin_client = _admin_for(api_client, group.branch)
    lesson = Lesson.objects.create(
        group=group, teacher=group.teacher, datetime=timezone.now() + timedelta(days=2)
    )

    resp = _reschedule(admin_client, lesson, timezone.now() - timedelta(days=1))

    assert resp.status_code == 400
    lesson.refresh_from_db()
    assert lesson.status == "scheduled", "перенос не должен был состояться"


def test_cannot_reschedule_onto_an_existing_lesson(api_client):
    """Два занятия одной группы в одну минуту — почти наверняка двойное нажатие."""
    group, _ = _group_with_student()
    admin_client = _admin_for(api_client, group.branch)
    lesson = Lesson.objects.create(
        group=group, teacher=group.teacher, datetime=timezone.now() + timedelta(days=2)
    )
    taken = timezone.now() + timedelta(days=3)
    Lesson.objects.create(group=group, teacher=group.teacher, datetime=taken)

    resp = _reschedule(admin_client, lesson, taken)

    assert resp.status_code == 409


def test_cannot_reschedule_a_conducted_lesson(api_client):
    """У проведённого урока есть посещаемость и история — он никуда не едет."""
    group, _ = _group_with_student()
    admin_client = _admin_for(api_client, group.branch)
    lesson = Lesson.objects.create(
        group=group,
        teacher=group.teacher,
        datetime=timezone.now() - timedelta(days=1),
        status="conducted",
    )

    resp = _reschedule(admin_client, lesson, timezone.now() + timedelta(days=2))

    assert resp.status_code == 400


def test_a_valid_reschedule_still_works(api_client):
    """Опорная точка: проверки не должны запретить обычный перенос."""
    group, student = _group_with_student()
    admin_client = _admin_for(api_client, group.branch)
    lesson = _charged_lesson(group, student, days_ahead=2)
    when = timezone.now() + timedelta(days=5)

    resp = _reschedule(admin_client, lesson, when)

    assert resp.status_code == 200, resp.json()
    lesson.refresh_from_db()
    assert lesson.status == "rescheduled"
    assert lesson.rescheduled_to_id is not None
    student.refresh_from_db()
    assert student.wallet_balance == Decimal("0.00"), (
        "деньги за старую дату обязаны вернуться при переносе"
    )
