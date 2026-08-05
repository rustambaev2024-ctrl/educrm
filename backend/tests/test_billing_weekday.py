"""Расписание хранится как пн=1..вс=7, а date.weekday() — это пн=0..вс=6.

Биллинг раньше сравнивал сырое slot["day"] с date.weekday() и списывал ровно
на день позже урока: группа «вт/чт/сб» ([2,4,6]) получала списания в ср/пт/вс,
включая воскресенье, когда занятий нет вообще.
"""
from datetime import date

from apps.lessons.services import slot_weekday


def test_slot_weekday_converts_to_python_convention():
    # пн=1..вс=7 -> пн=0..вс=6
    assert slot_weekday({"day": 1}) == 0  # понедельник
    assert slot_weekday({"day": 2}) == 1  # вторник
    assert slot_weekday({"day": 7}) == 6  # воскресенье


def test_juft_group_bills_on_lesson_days_not_a_day_later():
    schedule = [{"day": 2}, {"day": 4}, {"day": 6}]  # вт, чт, сб
    lesson_days = {slot_weekday(s) for s in schedule} - {None}

    # реальные уроки этой группы в августе 2026
    assert date(2026, 8, 1).weekday() in lesson_days   # суббота
    assert date(2026, 8, 4).weekday() in lesson_days   # вторник
    assert date(2026, 8, 6).weekday() in lesson_days   # четверг

    # дни, когда занятий нет — списаний быть не должно
    assert date(2026, 8, 2).weekday() not in lesson_days  # воскресенье
    assert date(2026, 8, 3).weekday() not in lesson_days  # понедельник


if __name__ == "__main__":
    test_slot_weekday_converts_to_python_convention()
    test_juft_group_bills_on_lesson_days_not_a_day_later()
    print("OK")
