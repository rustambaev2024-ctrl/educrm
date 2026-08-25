"""Гейт принудительной смены пароля выключен — проверяем, что он не мешает.

Исходно (T-026 / R-23) здесь проверялось обратное: что пользователь с
`must_change_password` не может работать через API, пока не сменит пароль.
На проде это оказалось ловушкой: экрана смены пароля во фронтенде нет
(`grep must_change_password src/` не находит ничего), поэтому любой аккаунт,
созданный без явного пароля, получал флаг и терял доступ ко всем эндпоинтам
без единого способа это исправить из интерфейса.

Владелец отключил гейт. Механизм в коде сохранён и включается переменной
окружения FORCE_PASSWORD_CHANGE=1 — вместе с экраном смены во фронтенде.
"""
import pytest
from django.conf import settings
from django.contrib.auth import get_user_model

User = get_user_model()
pytestmark = pytest.mark.django_db

PASSWORD = "secret123"


def test_gate_is_disabled_by_default():
    assert settings.FORCE_PASSWORD_CHANGE is False


def test_user_with_pending_change_flag_can_use_api(api_client):
    """Флаг может стоять, но доступ он больше не отбирает."""
    user = User.objects.create_user(
        phone="+998909800201", full_name="Flagged", role="student", password=PASSWORD
    )
    user.must_change_password = True
    user.save(update_fields=["must_change_password"])

    login = api_client.post(
        "/api/v1/auth/login/",
        {"phone": user.phone, "password": PASSWORD},
        format="json",
    )
    assert login.status_code == 200, login.json()
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.json()['access']}")

    response = api_client.get("/api/v1/auth/me/")
    assert response.status_code == 200, response.content
