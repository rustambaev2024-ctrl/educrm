"""Один телефон может быть заведён у нескольких организаций.

Раньше вход выбирал произвольную схему из совпадений и проверял пароль уже
в ней — родитель с детьми в двух центрах получал 401 на верных данных.
Схему выбираем по подошедшему паролю.

conftest подменяет LoginView._resolve_tenant_by_phone на заглушку, поэтому
ссылку на настоящий метод забираем на импорте модуля, до подмены.
"""
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import patch

from apps.accounts.views import LoginView

_RESOLVE = LoginView._resolve_tenant_by_phone

PHONE = "+998901112233"


class _Tenant:
    def __init__(self, schema_name):
        self.schema_name = schema_name


class _User:
    def __init__(self, password, role="parent"):
        self._password = password
        self.role = role

    def check_password(self, raw):
        return raw == self._password


def _resolve(users_by_schema, password, requested=None):
    """Прогоняет настоящий резолвер по фейковому набору схем."""
    active = {}

    @contextmanager
    def fake_schema_context(name):
        active["schema"] = name
        yield

    tenants = [_Tenant(name) for name in users_by_schema]

    class _TenantQuerySet:
        def exclude(self, **kwargs):
            return self

        def iterator(self):
            return iter(tenants)

    tenant_model = SimpleNamespace(objects=_TenantQuerySet())
    user_manager = SimpleNamespace(
        filter=lambda **kwargs: SimpleNamespace(
            first=lambda: users_by_schema[active["schema"]]
        )
    )
    data = {"password": password}
    if requested:
        data["schema"] = requested
    request = SimpleNamespace(data=data, META={})

    with patch("apps.accounts.views.get_tenant_model", return_value=tenant_model), \
         patch("apps.accounts.views.schema_context", fake_schema_context), \
         patch("apps.accounts.views.get_public_schema_name", return_value="public"), \
         patch("apps.accounts.views.User", SimpleNamespace(objects=user_manager)):
        return _RESOLVE(LoginView(), PHONE, request)


def test_picks_the_tenant_where_the_password_matches():
    tenant = _resolve(
        {"school_a": _User("alpha"), "school_b": _User("bravo")},
        password="bravo",
    )
    assert tenant.schema_name == "school_b"


def test_single_match_still_resolves():
    tenant = _resolve({"school_a": _User("alpha")}, password="alpha")
    assert tenant.schema_name == "school_a"


def test_same_password_in_two_tenants_asks_instead_of_guessing():
    """Раньше выбиралась первая подходящая организация и вторая для человека
    исчезала навсегда — переключиться было нечем."""
    result = _resolve(
        {
            "school_a": _User("same", role="parent"),
            "school_b": _User("same", role="superadmin"),
        },
        password="same",
    )
    assert isinstance(result, list)
    assert {t.schema_name for t in result} == {"school_a", "school_b"}


def test_explicit_choice_wins_over_guessing():
    tenant = _resolve(
        {
            "school_a": _User("same", role="parent"),
            "school_b": _User("same", role="superadmin"),
        },
        password="same",
        requested="school_a",
    )
    assert tenant.schema_name == "school_a"


def test_explicit_choice_is_ignored_when_password_does_not_fit_it():
    """Выбор организации — не способ обойти пароль."""
    tenant = _resolve(
        {"school_a": _User("alpha"), "school_b": _User("bravo")},
        password="bravo",
        requested="school_a",
    )
    assert tenant.schema_name == "school_b"


def test_unknown_phone_resolves_to_none_not_an_error():
    """Раньше незарегистрированный номер давал 400, а неверный пароль — 401:
    по разнице статусов перебирались существующие номера."""
    assert _resolve({}, password="anything") is None


def test_wrong_password_falls_back_to_first_match():
    """Отказ должен выдать сериализатор — резолвер не превращает его в 500."""
    tenant = _resolve(
        {"school_a": _User("alpha"), "school_b": _User("bravo")},
        password="nope",
    )
    assert tenant.schema_name == "school_a"
