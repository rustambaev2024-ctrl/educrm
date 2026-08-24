"""
Сторож против расхождения определений между бэкендом и фронтом.

Каждая находка аудита 9 августа 2026 из раздела «одна подпись, разные числа»
началась одинаково: правило записали во второй файл, а потом поменяли только
в одном. Комментарий «не забудь поправить и там» такое не останавливает —
останавливает падающий тест.

Тест читает src/lib/data/definitions.ts как текст (запускать ноду в питоновом
CI не нужно) и сверяет наборы с backend/apps/core/definitions.py.
"""

import re
from pathlib import Path

import pytest

from apps.core import definitions as backend_defs


FRONTEND_DEFINITIONS = (
    Path(__file__).resolve().parents[2] / "src" / "lib" / "data" / "definitions.ts"
)

# Наборы, которые обязаны совпадать буква в букву.
PARITY_CONSTANTS = (
    "ATTENDANCE_PRESENT_STATUSES",
    "ATTENDANCE_COUNTED_STATUSES",
    "ACTIVE_STUDENT_STATUSES",
    "ENROLLED_STUDENT_STATUSES",
    "INACTIVE_STUDENT_STATUSES",
    "INCOME_PAYMENT_TYPES",
    "CHARGE_PAYMENT_TYPES",
    "INCOME_REVERSAL_TYPES",
)


def _parse_frontend_arrays(source: str) -> dict[str, tuple[str, ...]]:
    """Вытаскивает `export const NAME = ["a", "b"] as const;` из TS-файла."""
    pattern = re.compile(
        r"export const ([A-Z][A-Z0-9_]*)\s*=\s*\[(.*?)\]\s*as const",
        re.DOTALL,
    )
    result: dict[str, tuple[str, ...]] = {}
    for name, body in pattern.findall(source):
        values = re.findall(r'"([^"]*)"', body)
        result[name] = tuple(values)
    return result


@pytest.fixture(scope="module")
def frontend_constants() -> dict[str, tuple[str, ...]]:
    assert FRONTEND_DEFINITIONS.exists(), (
        f"не найден фронтовый файл определений: {FRONTEND_DEFINITIONS}. "
        "Если его переместили — поправьте путь здесь, а не удаляйте тест."
    )
    parsed = _parse_frontend_arrays(FRONTEND_DEFINITIONS.read_text(encoding="utf-8"))
    assert parsed, (
        "из definitions.ts не удалось вытащить ни одного набора — скорее всего "
        "изменился формат объявления (ожидается `export const NAME = [...] as const`)"
    )
    return parsed


@pytest.mark.parametrize("name", PARITY_CONSTANTS)
def test_definition_matches_frontend(name: str, frontend_constants):
    backend_value = getattr(backend_defs, name, None)
    assert backend_value is not None, (
        f"{name} исчез из apps/core/definitions.py, но остался во фронте"
    )
    frontend_value = frontend_constants.get(name)
    assert frontend_value is not None, (
        f"{name} есть на бэкенде, но не объявлен в src/lib/data/definitions.ts"
    )
    assert tuple(backend_value) == frontend_value, (
        f"{name} разошёлся: бэкенд {tuple(backend_value)}, фронт {frontend_value}. "
        "Определение обязано быть одним — поправьте обе стороны."
    )


def test_excused_is_not_counted_in_attendance():
    """Уважительный пропуск не должен попадать в знаменатель ни на одной стороне."""
    assert "excused" not in backend_defs.ATTENDANCE_COUNTED_STATUSES
    assert "excused" not in backend_defs.ATTENDANCE_PRESENT_STATUSES


def test_present_statuses_exist_in_the_model():
    """
    Ровно та ошибка, из-за которой в списке присутствующих оказался статус
    "online", которого нет в модели.
    """
    from apps.lessons.models import Attendance

    known = {value for value, _label in Attendance.STATUS_CHOICES}
    unknown = set(backend_defs.ATTENDANCE_PRESENT_STATUSES) - known
    assert not unknown, f"статусов нет в Attendance.STATUS_CHOICES: {sorted(unknown)}"
    unknown_counted = set(backend_defs.ATTENDANCE_COUNTED_STATUSES) - known
    assert not unknown_counted, (
        f"статусов нет в Attendance.STATUS_CHOICES: {sorted(unknown_counted)}"
    )


def test_student_statuses_cover_the_model_exactly():
    """
    Каждый статус ученика должен попадать ровно в один набор: либо числится,
    либо выбыл. Новый статус в модели, забытый здесь, сломает тест, а не отчёт.
    """
    from apps.students.models import Student

    known = {value for value, _label in Student.STATUS_CHOICES}
    enrolled = set(backend_defs.ENROLLED_STUDENT_STATUSES)
    inactive = set(backend_defs.INACTIVE_STUDENT_STATUSES)

    assert not (enrolled & inactive), (
        f"статус числится и выбывшим, и учащимся: {sorted(enrolled & inactive)}"
    )
    assert enrolled | inactive == known, (
        f"наборы не покрывают Student.STATUS_CHOICES: "
        f"не распределены {sorted(known - (enrolled | inactive))}, "
        f"лишние {sorted((enrolled | inactive) - known)}"
    )
    assert set(backend_defs.ACTIVE_STUDENT_STATUSES) <= enrolled, (
        "«учится сейчас» обязан быть подмножеством «числится»"
    )


def test_reversal_type_is_a_charge():
    """Отмена поступления обязана быть списанием — иначе баланс поедет."""
    assert set(backend_defs.INCOME_REVERSAL_TYPES) <= set(
        backend_defs.CHARGE_PAYMENT_TYPES
    )


def test_wallet_rules_cover_every_payment_type():
    """
    Каждый тип операции обязан попадать ровно в одну корзину: пополняет
    кошелёк, уменьшает его или не касается вовсе. Новый тип, забытый здесь,
    молча не двигал бы баланс — и это заметили бы только по расхождению
    в деньгах.
    """
    from apps.finance.models import Payment

    known = {value for value, _label in Payment.PAYMENT_TYPE_CHOICES}
    credit = set(backend_defs.WALLET_CREDIT_TYPES)
    debit = set(backend_defs.WALLET_DEBIT_TYPES)
    neutral = set(backend_defs.NON_WALLET_TYPES)

    assert not (credit & debit), f"тип и пополняет, и списывает: {sorted(credit & debit)}"
    assert credit | debit | neutral == known, (
        f"не распределены: {sorted(known - (credit | debit | neutral))}, "
        f"лишние: {sorted((credit | debit | neutral) - known)}"
    )


def test_wallet_delta_signs():
    from decimal import Decimal

    assert backend_defs.wallet_delta("top_up", Decimal("100")) == Decimal("100")
    assert backend_defs.wallet_delta("refund", Decimal("100")) == Decimal("100")
    assert backend_defs.wallet_delta("charge", Decimal("100")) == Decimal("-100")
    assert backend_defs.wallet_delta("manual_charge", Decimal("100")) == Decimal("-100")
    assert backend_defs.wallet_delta("expense", Decimal("100")) == Decimal("0"), (
        "расход организации идёт мимо кошелька ученика"
    )
