"""Парольной политики нет — и это проверяется намеренно.

Исходно (T-015 / R-23) здесь была обратная проверка: что валидаторы включены
и слабый пароль отвергается. Владелец отменил это решение после жалоб с прода —
администраторы учебных центров заводят учеников и диктуют пароли голосом,
требование «8 символов, не только цифры, не из списка распространённых»
блокировало создание учеников.

Тесты оставлены, но перевёрнуты: теперь они стерегут отсутствие политики,
чтобы её не включили обратно случайно вместе с чужой веткой.
Возврат политики — только явным решением владельца.
"""
import pytest
from django.conf import settings
from django.contrib.auth import get_user_model

User = get_user_model()
pytestmark = pytest.mark.django_db


def test_password_validators_are_disabled():
    """AUTH_PASSWORD_VALIDATORS пуст. Решение владельца, а не упущение."""
    assert settings.AUTH_PASSWORD_VALIDATORS == []


def test_trivial_password_is_accepted():
    """Пароль вида "1111" должен приниматься: ограничений нет вообще."""
    user = User.objects.create_user(
        phone="+998909800101", full_name="Trivial", role="student", password="1111"
    )
    user.refresh_from_db()
    assert user.check_password("1111")


def test_force_password_change_is_off_by_default():
    """Гейт принудительной смены выключен.

    Он блокировал КАЖДЫЙ запрос пользователя с `must_change_password`, а экрана
    смены пароля во фронтенде не существует — аккаунт с автопаролем оказывался
    заблокирован наглухо, без пути наружу.
    """
    assert settings.FORCE_PASSWORD_CHANGE is False
