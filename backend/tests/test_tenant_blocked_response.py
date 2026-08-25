"""T-029: тело 403 frozen/archived не раскрывает статус центра анонимам.

`POST /api/v1/quiz-sessions/<id>/join/` — анонимный, но тенантный путь, и он
проходит через `_is_blocked_tenant_request`. До фикса аноним, перебирая
`X-Tenant-Schema`, получал в теле `institution_status` и разный текст для
`frozen`/`archived` — то есть подтверждение существования учебного центра и
его состояние.

Middleware исключён из MIDDLEWARE в тестовых настройках (требует PostgreSQL),
поэтому класс проверяется напрямую с подставленным резолвом тенанта — тот же
приём, что в `test_tenant_header_guard.py`.
"""
import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.test import RequestFactory
from rest_framework_simplejwt.tokens import AccessToken

from apps.tenants.middleware import HeaderOrDomainTenantMiddleware

pytestmark = pytest.mark.django_db

SCHEMA = "tenant_alpha"
JOIN_PATH = "/api/v1/quiz-sessions/11111111-1111-1111-1111-111111111111/join/"


def _tenant(status):
    return SimpleNamespace(schema_name=SCHEMA, status=status)


def _token(role="teacher"):
    token = AccessToken()
    token["role"] = role
    token["schema_name"] = SCHEMA
    return str(token)


@pytest.fixture
def middleware():
    return HeaderOrDomainTenantMiddleware(
        lambda request: SimpleNamespace(status_code=200)
    )


def _call(middleware, status, bearer=None, method="post", path=JOIN_PATH):
    factory = RequestFactory()
    extra = {"HTTP_X_TENANT_SCHEMA": SCHEMA}
    if bearer:
        extra["HTTP_AUTHORIZATION"] = f"Bearer {bearer}"
    request = getattr(factory, method)(path, **extra)

    with patch.object(
        HeaderOrDomainTenantMiddleware,
        "_resolve_from_header",
        return_value=_tenant(status),
    ), patch("apps.tenants.middleware.connection"):
        return middleware(request)


# ─── аноним ───────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("status", ["frozen", "archived"])
def test_anonymous_body_hides_institution_status(middleware, status):
    response = _call(middleware, status)

    assert response.status_code == 403
    body = json.loads(response.content)
    assert "institution_status" not in body
    assert set(body["detail"]) == {"uz", "ru"}


def test_anonymous_body_identical_for_frozen_and_archived(middleware):
    """Разный текст сам по себе был оракулом состояния центра."""
    frozen = json.loads(_call(middleware, "frozen").content)
    archived = json.loads(_call(middleware, "archived").content)

    assert frozen == archived


def test_broken_token_is_treated_as_anonymous(middleware):
    response = _call(middleware, "frozen", bearer="not-a-jwt")

    assert response.status_code == 403
    assert "institution_status" not in json.loads(response.content)


# ─── свой пользователь ────────────────────────────────────────────────────────

@pytest.mark.parametrize("status", ["frozen", "archived"])
def test_authenticated_still_sees_reason(middleware, status):
    """Сотрудник центра должен понимать, почему перестали проходить изменения."""
    response = _call(middleware, status, bearer=_token())

    assert response.status_code == 403
    body = json.loads(response.content)
    assert body["institution_status"] == status
    assert set(body["detail"]) == {"uz", "ru"}


def test_frozen_and_archived_texts_differ_for_authenticated(middleware):
    frozen = json.loads(_call(middleware, "frozen", bearer=_token()).content)
    archived = json.loads(_call(middleware, "archived", bearer=_token()).content)

    assert frozen["detail"] != archived["detail"]


# ─── легитимные пути не задеты ────────────────────────────────────────────────

def test_read_requests_are_not_blocked(middleware):
    """Гард стоит только на мутациях — чтение замороженного центра работало."""
    assert _call(middleware, "frozen", method="get").status_code == 200


def test_active_tenant_is_not_blocked(middleware):
    assert _call(middleware, "active", bearer=_token()).status_code == 200
