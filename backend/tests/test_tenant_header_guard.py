"""T-017 / R-25: X-Tenant-Schema обязан совпадать со схемой из JWT.

Middleware исключён из MIDDLEWARE в тестовых настройках (он требует PostgreSQL),
поэтому класс проверяется напрямую с подставленным резолвом тенанта.
"""
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.test import RequestFactory
from rest_framework_simplejwt.tokens import AccessToken

from apps.tenants.middleware import HeaderOrDomainTenantMiddleware

pytestmark = pytest.mark.django_db


def _tenant(schema):
    return SimpleNamespace(schema_name=schema, status="active")


def _token(schema=None, role="teacher"):
    token = AccessToken()
    token["role"] = role
    if schema is not None:
        token["schema_name"] = schema
    return str(token)


def _request(bearer=None, path="/api/v1/groups/"):
    factory = RequestFactory()
    extra = {"HTTP_AUTHORIZATION": f"Bearer {bearer}"} if bearer else {}
    return factory.get(path, **extra)


@pytest.fixture
def middleware():
    return HeaderOrDomainTenantMiddleware(lambda request: SimpleNamespace(status_code=200))


def test_mismatch_is_rejected(middleware):
    request = _request(_token("tenant_alpha"))
    assert middleware._jwt_schema_mismatch(request, _tenant("tenant_beta")) is True


def test_matching_schema_passes(middleware):
    request = _request(_token("tenant_alpha"))
    assert middleware._jwt_schema_mismatch(request, _tenant("tenant_alpha")) is False


def test_token_without_claim_passes(middleware):
    """Токены, выпущенные до появления claim, не должны разлогинивать всех разом."""
    request = _request(_token(None))
    assert middleware._jwt_schema_mismatch(request, _tenant("tenant_alpha")) is False


def test_anonymous_request_passes(middleware):
    assert middleware._jwt_schema_mismatch(_request(), _tenant("tenant_alpha")) is False


def test_broken_token_is_left_to_drf(middleware):
    request = _request("not-a-jwt")
    assert middleware._jwt_schema_mismatch(request, _tenant("tenant_alpha")) is False


def test_superadmin_may_cross_tenants(middleware):
    request = _request(_token("tenant_alpha", role="superadmin"))
    assert middleware._jwt_schema_mismatch(request, _tenant("tenant_beta")) is False


def test_response_is_403_with_both_locales(middleware):
    request = _request(_token("tenant_alpha"))
    request.META["HTTP_X_TENANT_SCHEMA"] = "tenant_beta"

    with patch.object(
        HeaderOrDomainTenantMiddleware, "_resolve_from_header", return_value=_tenant("tenant_beta")
    ), patch("apps.tenants.middleware.connection"):
        response = middleware(request)

    assert response.status_code == 403
    import json

    body = json.loads(response.content)
    assert set(body["detail"]) == {"uz", "ru"}


def test_legitimate_request_reaches_view(middleware):
    request = _request(_token("tenant_alpha"))
    request.META["HTTP_X_TENANT_SCHEMA"] = "tenant_alpha"

    with patch.object(
        HeaderOrDomainTenantMiddleware,
        "_resolve_from_header",
        return_value=_tenant("tenant_alpha"),
    ), patch("apps.tenants.middleware.connection"):
        response = middleware(request)

    assert response.status_code == 200
