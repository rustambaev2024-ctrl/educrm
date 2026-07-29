"""Пароли: генерация временных и парольная политика (T-015 / R-23).

До этого в двух местах стоял литерал `ChangeMe123` (`staff/serializers.py`,
`students/serializers.py`), а `AUTH_PASSWORD_VALIDATORS` был пустым списком —
любой аккаунт, созданный без явного пароля, имел один и тот же общеизвестный
пароль на всей платформе.
"""
import secrets
import string

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

_ALPHABET = string.ascii_letters + string.digits


def generate_temp_password(length: int = 12) -> str:
    """Криптостойкий временный пароль. `secrets`, не `random`."""
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


def validate_password_strength(value: str, user=None) -> str:
    """Прогоняет `AUTH_PASSWORD_VALIDATORS` и отдаёт двуязычную ошибку."""
    try:
        validate_password(value, user=user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError({
            "detail": {
                "uz": (
                    "Parol juda oddiy: kamida 8 belgi, faqat raqamlardan iborat "
                    "bo'lmasligi va keng tarqalgan parol bo'lmasligi kerak"
                ),
                "ru": (
                    "Пароль слишком простой: минимум 8 символов, не только цифры "
                    "и не из списка распространённых"
                ),
                "rules": list(exc.messages),
            }
        }) from exc
    return value
