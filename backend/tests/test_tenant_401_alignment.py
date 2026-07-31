"""T-031: 401 для несуществующей схемы неотличим от 401 существующей.

Оракул был не в статусе (оба 401), а в теле и заголовках:
- несуществующая схема → `{"detail": "User not found"}`, без `WWW-Authenticate`;
- существующая схема без токена → DRF `NotAuthenticated` + `WWW-Authenticate`;
- существующая схема с мусорным токеном → simplejwt `token_not_valid` + `messages`.

Перебором `X-Tenant-Schema` из этого собирался список реальных схем, то есть
список учебных центров платформы.

Эталон («что ответил бы существующий тенант») снимается тем же тестовым
клиентом без tenant-middleware: в тестовых настройках middleware отключён
(требует PostgreSQL), поэтому запрос доходит до DRF напрямую.
"""
import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.test import Client, RequestFactory
from rest_framework_simplejwt.tokens import AccessToken

from apps.tenants.middleware import HeaderOrDomainTenantMiddleware

pytestmark = pytest.mark.django_db

PATH = "/api/v1/groups/"


def _token_without_user():
    """Валидный по подписи access-токен, за которым нет пользователя схемы."""
    token = AccessToken()
    token["role"] = "teacher"
    token["schema_name"] = "tenant_alpha"
    return str(token)


def _existing_tenant_response(bearer=None):
    """Что видит клиент на СУЩЕСТВУЮЩЕЙ схеме без пригодных учётных данных."""
    extra = {"HTTP_AUTHORIZATION": f"Bearer {bearer}"} if bearer else {}
    return Client().get(PATH, **extra)


def _ghost_tenant_response(bearer=None):
    """Что видит клиент, подставивший НЕСУЩЕСТВУЮЩУЮ схему."""
    middleware = HeaderOrDomainTenantMiddleware(
        lambda request: SimpleNamespace(status_code=200)
    )
    extra = {"HTTP_X_TENANT_SCHEMA": "tenant_ghost"}
    if bearer:
        extra["HTTP_AUTHORIZATION"] = f"Bearer {bearer}"
    request = RequestFactory().get(PATH, **extra)

    with patch.object(
        HeaderOrDomainTenantMiddleware, "_resolve_from_header", return_value=None
    ), patch.object(
        HeaderOrDomainTenantMiddleware, "_resolve_from_domain", return_value=None
    ), patch(
        "apps.tenants.middleware.connection"
    ):
        return middleware(request)


def _snapshot(response):
    return (
        response.status_code,
        json.loads(response.content),
        response.get("WWW-Authenticate"),
    )


def test_no_token_ghost_schema_matches_existing_schema():
    assert _snapshot(_ghost_tenant_response()) == _snapshot(
        _existing_tenant_response()
    )


def test_broken_token_ghost_schema_matches_existing_schema():
    """Мусорный токен: раньше существующая схема отдавала token_not_valid."""
    assert _snapshot(_ghost_tenant_response(bearer="not-a-jwt")) == _snapshot(
        _existing_tenant_response(bearer="not-a-jwt")
    )


def test_ghost_schema_sets_www_authenticate_header():
    """Отсутствие заголовка само по себе выдавало «этой схемы нет»."""
    assert _ghost_tenant_response().get("WWW-Authenticate") == 'Bearer realm="api"'


def test_valid_token_without_user_looks_like_foreign_schema():
    """Валидный токен + несуществующая схема → то же «User not found»,
    что simplejwt отдаёт для чужой существующей схемы."""
    response = _ghost_tenant_response(bearer=_token_without_user())

    assert response.status_code == 401
    assert json.loads(response.content)["detail"] == "User not found"
    assert response.get("WWW-Authenticate") == 'Bearer realm="api"'


def test_ghost_schema_never_reaches_the_view():
    """Запрос с нерезолвленным тенантом не должен попасть в public-схему."""
    assert _ghost_tenant_response().status_code == 401
    assert _ghost_tenant_response(bearer=_token_without_user()).status_code == 401
