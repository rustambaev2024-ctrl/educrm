"""Списание за уроки не должно пройти дважды за один день.

Задача запускается и по расписанию (celery beat, 23:00), и вручную через
/api/v1/trigger-daily-charge/. Проверка already_charged_ids внутри задачи
не атомарна: два одновременных прогона успевают её пройти до того, как хоть
один создаст платёж, — и каждый ученик получает два списания.
"""
from datetime import date
from unittest.mock import patch

import pytest
from django.core.cache import cache

from apps.finance.tasks import daily_lesson_charge

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _clean_lock():
    cache.delete(f"daily_lesson_charge:{date.today()}")
    yield
    cache.delete(f"daily_lesson_charge:{date.today()}")


def test_second_run_is_skipped_while_the_first_holds_the_lock():
    calls = []

    def _fake_charge(today, weekday):
        calls.append(today)
        # Пока первый прогон внутри — запускаем второй, как это делает
        # директор кнопкой во время работы beat.
        if len(calls) == 1:
            daily_lesson_charge()

    with patch("apps.finance.tasks._charge_all_tenants", _fake_charge):
        daily_lesson_charge()

    assert len(calls) == 1, "второй прогон должен быть пропущен, а не списать повторно"


def test_lock_is_released_so_the_next_day_can_run():
    with patch("apps.finance.tasks._charge_all_tenants", lambda *a: None):
        daily_lesson_charge()
        daily_lesson_charge()  # замок снят — повтор допустим

    assert cache.get(f"daily_lesson_charge:{date.today()}") is None


def test_lock_is_released_even_if_charging_fails():
    def _boom(today, weekday):
        raise RuntimeError("сеть отвалилась посреди списания")

    with patch("apps.finance.tasks._charge_all_tenants", _boom):
        with pytest.raises(RuntimeError):
            daily_lesson_charge()

    assert cache.get(f"daily_lesson_charge:{date.today()}") is None
