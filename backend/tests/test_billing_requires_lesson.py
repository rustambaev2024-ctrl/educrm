"""
Списание за урок не должно происходить в день, когда урока нет.

Жалоба клиентов (август 2026): «у учеников списались деньги в выходные, когда
занятий не было вообще».

Причина: daily_lesson_charge доверяет ТОЛЬКО полю Group.schedule и не смотрит,
существует ли в этот день реальный Lesson:

    lesson = group.lessons.filter(datetime__date=today).first()
    if lesson and lesson.status == "cancelled":
        continue

Если урока нет вовсе (lesson is None), условие не срабатывает и деньги
списываются. А урока может не быть по четырём разным причинам, потому что
генератор уроков (generate_lessons_for_group_sync) применяет ограничения,
которых у биллинга нет:

  * слот расписания без времени начала — урок не создаётся никогда;
  * дата раньше group.start_date — уроков ещё нет;
  * дата позже group.end_date — уроков уже нет;
  * горизонт генерации конечен (90 дней), а расписание вечно.

Хуже того, у такого платежа lesson_id = NULL, поэтому сигнал
refund_charge_when_marked_excused (он ищет списания по lesson_id) вернуть его
не может — деньги не отменяются даже отметкой «уважительная причина».
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest

from apps.courses.models import Group, GroupMembership
from apps.finance.models import Payment
from apps.finance.tasks import charge_groups_for_day
from apps.lessons.models import Lesson
from tests.factories import (
    BranchFactory,
    CourseFactory,
    StaffFactory,
    StudentFactory,
)

pytestmark = pytest.mark.django_db


MONDAY = date(2026, 8, 10)
SUNDAY = date(2026, 8, 16)


def _group(**kwargs) -> Group:
    """
    Группа с расписанием «понедельник, 10:00».

    Создание группы вызывает сигнал, который сам генерирует уроки на 90 дней
    вперёд — тесты на этом и держатся: уроки появляются ровно там, где их
    видит и продукт.
    """
    branch = BranchFactory()
    defaults = dict(
        name="Test group",
        course=CourseFactory(),
        branch=branch,
        teacher=StaffFactory(branch=branch),
        status="active",
        monthly_price=Decimal("600000.00"),
        start_date=MONDAY,
        schedule=[{"day": 1, "start": "10:00"}],  # пн=1 в конвенции фронта
    )
    defaults.update(kwargs)
    return Group.objects.create(**defaults)


def _enrol(group: Group):
    student = StudentFactory(branch=group.branch, wallet_balance=Decimal("0.00"))
    GroupMembership.objects.create(group=group, student=student)
    return student


def _charges(student):
    return Payment.objects.filter(student=student, payment_type="charge")


def _lessons_on(group: Group, day: date):
    return Lesson.objects.filter(group=group, datetime__date=day)


# ─────────── Опорные точки: без них «починка» = «перестать списывать» ───────────


def test_charge_happens_when_the_lesson_exists():
    group = _group()
    student = _enrol(group)
    assert _lessons_on(group, MONDAY).count() == 1, "предусловие: урок сгенерирован"

    charge_groups_for_day(MONDAY, MONDAY.weekday())

    assert _charges(student).count() == 1
    assert _charges(student).first().lesson_id is not None, (
        "списание обязано быть привязано к уроку — иначе возврат по "
        "«уважительной причине» не сможет его найти"
    )


def test_cancelled_lesson_is_not_charged():
    group = _group()
    student = _enrol(group)
    _lessons_on(group, MONDAY).update(status="cancelled")

    charge_groups_for_day(MONDAY, MONDAY.weekday())

    assert _charges(student).count() == 0


# ─────────── Расхождения расписания и реальных уроков ───────────


def test_no_charge_when_the_lesson_horizon_ran_out():
    """
    Уроки кончились (горизонт 90 дней истёк или расписание пересобрали):
    расписание говорит «понедельник», урока нет. Платить не за что.
    """
    group = _group()
    student = _enrol(group)
    _lessons_on(group, MONDAY).delete()

    charge_groups_for_day(MONDAY, MONDAY.weekday())

    assert _charges(student).count() == 0, (
        "списание в день, когда урока не существует — ровно та жалоба клиентов"
    )


def test_no_charge_for_a_slot_without_a_start_time():
    """
    Слот без времени начала: генератор уроков его пропускает
    (`if not start_time: continue`), урок не появляется никогда, а биллинг
    видит только номер дня — и списывает каждое воскресенье, вечно.
    """
    group = _group(schedule=[{"day": 1, "start": "10:00"}, {"day": 7}])
    student = _enrol(group)
    assert _lessons_on(group, SUNDAY).count() == 0, (
        "предусловие: для слота без времени урок не создаётся"
    )

    charge_groups_for_day(SUNDAY, SUNDAY.weekday())

    assert _charges(student).count() == 0, (
        "воскресенье без времени начала: урока нет — списания быть не должно"
    )


def test_no_charge_before_the_group_starts():
    """Группа стартует через неделю: уроков ещё нет, платить не за что."""
    group = _group(start_date=MONDAY + timedelta(days=7), status="recruiting")
    student = _enrol(group)
    assert _lessons_on(group, MONDAY).count() == 0

    charge_groups_for_day(MONDAY, MONDAY.weekday())

    assert _charges(student).count() == 0, (
        "списание до старта группы: start_date генератор учитывает, биллинг — нет"
    )


def test_no_charge_after_the_group_ends():
    """Группа закончилась, но статус остался active — уроков нет, списаний тоже."""
    group = _group(end_date=MONDAY - timedelta(days=1))
    student = _enrol(group)
    assert _lessons_on(group, MONDAY).count() == 0

    charge_groups_for_day(MONDAY, MONDAY.weekday())

    assert _charges(student).count() == 0, (
        "списание после окончания группы: end_date биллинг не смотрит вовсе"
    )


# ─────────── Повторный прогон не должен списывать второй раз ───────────


def test_running_twice_for_the_same_day_charges_once():
    group = _group()
    student = _enrol(group)

    charge_groups_for_day(MONDAY, MONDAY.weekday())
    charge_groups_for_day(MONDAY, MONDAY.weekday())

    assert _charges(student).count() == 1, "повторный прогон обязан быть идемпотентным"


def test_idempotency_does_not_depend_on_when_the_task_ran():
    """
    Защита от повтора не должна опираться на дату СОЗДАНИЯ платежа.

    Раньше повтор ловился условием `created_at__date=today`: сравнивались
    расчётный день и календарный день записи. Они расходятся при любом
    запуске «не в тот день» — ручной триггер ночью, повтор после сбоя,
    расхождение часовых поясов контейнера (UTC) и Django (Asia/Tashkent).
    Тогда защита молча не срабатывает и деньги списываются дважды.

    Привязка к уроку от времени запуска не зависит вовсе.
    """
    group = _group()
    student = _enrol(group)

    charge_groups_for_day(MONDAY, MONDAY.weekday())
    count_after_first = _charges(student).count()
    # Тот же расчётный день, но платёж создан «не сегодня» — created_at в
    # тестах всегда равен реальному сейчас, то есть заведомо не MONDAY.
    charge_groups_for_day(MONDAY, MONDAY.weekday())

    assert count_after_first == 1
    assert _charges(student).count() == 1, (
        "повтор поймался только потому, что ключ идемпотентности — урок, "
        "а не дата создания платежа"
    )


# ─────────── Итог в журнале должен быть правдой ───────────


def test_the_task_reports_how_much_it_charged():
    """
    Раньше задача писала «completed» независимо от результата, поэтому
    рабочую ночь нельзя было отличить от полностью сломанной — о списаниях
    в пустоту узнали от клиентов, а не из журнала.
    """
    group = _group()
    _enrol(group)
    _enrol(group)

    charged, without_lesson = charge_groups_for_day(MONDAY, MONDAY.weekday())

    assert charged == 2, "оба ученика группы должны попасть в счётчик"
    assert without_lesson == 0


def test_groups_without_a_lesson_are_counted_separately():
    """Расхождение расписания и календаря обязано быть видно числом."""
    group = _group()
    _enrol(group)
    _lessons_on(group, MONDAY).delete()

    charged, without_lesson = charge_groups_for_day(MONDAY, MONDAY.weekday())

    assert charged == 0
    assert without_lesson == 1, (
        "группа с учебным днём, но без урока — то самое расхождение, "
        "которое раньше молча превращалось в списание"
    )


def test_a_repeat_run_reports_zero_new_charges():
    group = _group()
    _enrol(group)

    first, _ = charge_groups_for_day(MONDAY, MONDAY.weekday())
    second, _ = charge_groups_for_day(MONDAY, MONDAY.weekday())

    assert first == 1
    assert second == 0, "повтор не списывает — и обязан честно показать ноль"
