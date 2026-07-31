"""T-018 / R-24: глобальная пагинация списков без обрушения существующего контракта.

T-028 (в конце файла): непагинированный список, упёршийся в `MAX_UNPAGINATED`,
обязан сказать об этом явно — иначе клиент не отличает «записей ровно 1000» от
«записей больше, остальные молча потеряны».
"""
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model

from apps.core.pagination import OptInPageNumberPagination
from apps.institutions.models import Branch

User = get_user_model()
pytestmark = pytest.mark.django_db


def _auth(api_client, user, password="secret123"):
    response = api_client.post(
        "/api/v1/auth/login/",
        {"phone": user.phone, "password": password},
        format="json",
    )
    assert response.status_code == 200, response.json()
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['access']}")


@pytest.fixture
def director(api_client):
    user = User.objects.create_user(
        phone="+998909600001", full_name="Director", role="director", password="secret123"
    )
    for i in range(7):
        Branch.objects.create(name=f"B{i}", address="A", phone=f"+99890199{i:04d}")
    _auth(api_client, user)
    return user


def test_pagination_class_is_configured_globally():
    from django.conf import settings

    assert (
        settings.REST_FRAMEWORK["DEFAULT_PAGINATION_CLASS"]
        == "apps.core.pagination.OptInPageNumberPagination"
    )


def test_list_without_params_keeps_flat_contract(api_client, director):
    """Существующие клиенты не должны получить обрезанный или изменённый ответ."""
    response = api_client.get("/api/v1/branches/")
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert len(body) == 7


def test_client_can_opt_in_to_pagination(api_client, director):
    response = api_client.get("/api/v1/branches/?page=1&page_size=3")
    assert response.status_code == 200
    body = response.json()
    assert set(body) >= {"count", "next", "previous", "results"}
    assert body["count"] == 7
    assert len(body["results"]) == 3
    assert body["next"] is not None


def test_second_page_returns_remainder(api_client, director):
    response = api_client.get("/api/v1/branches/?page=3&page_size=3")
    assert response.status_code == 200
    body = response.json()
    assert len(body["results"]) == 1
    assert body["next"] is None


def test_max_page_size_is_capped():
    assert OptInPageNumberPagination.max_page_size == 1000
    assert OptInPageNumberPagination.MAX_UNPAGINATED == 1000


# ─── T-028: признак усечения ──────────────────────────────────────────────────

def test_untruncated_list_has_no_truncation_header(api_client, director):
    response = api_client.get("/api/v1/branches/")

    assert response.status_code == 200
    assert len(response.json()) == 7
    assert response.get("X-Result-Truncated") is None


def test_truncated_list_signals_truncation(api_client, director):
    """7 филиалов при потолке 3: клиент получает 3 и явный признак усечения."""
    with patch.object(OptInPageNumberPagination, "MAX_UNPAGINATED", 3):
        response = api_client.get("/api/v1/branches/")

    assert response.status_code == 200
    assert len(response.json()) == 3
    assert response["X-Result-Truncated"] == "true"
    assert response["X-Result-Limit"] == "3"


def test_exact_limit_is_not_reported_as_truncated(api_client, director):
    """Ровно потолок — не усечение; иначе признак станет ложноположительным."""
    with patch.object(OptInPageNumberPagination, "MAX_UNPAGINATED", 7):
        response = api_client.get("/api/v1/branches/")

    assert len(response.json()) == 7
    assert response.get("X-Result-Truncated") is None


def test_paginated_request_is_never_reported_as_truncated(api_client, director):
    """Клиент, попросивший страницу, получает count/next — усечения нет."""
    with patch.object(OptInPageNumberPagination, "MAX_UNPAGINATED", 3):
        response = api_client.get("/api/v1/branches/?page=1&page_size=3")

    assert response.json()["count"] == 7
    assert response.get("X-Result-Truncated") is None


def test_truncation_headers_are_exposed_to_browser():
    """Без Expose-Headers фронт не увидит признак при кросс-доменном запросе."""
    from django.http import HttpResponse
    from django.test import RequestFactory, override_settings

    from apps.core.middleware import DevCorsMiddleware

    origin = "https://app.example.com"
    middleware = DevCorsMiddleware(lambda request: HttpResponse())
    request = RequestFactory().get("/api/v1/branches/", HTTP_ORIGIN=origin)

    with override_settings(CORS_ALLOWED_ORIGINS=[origin]):
        response = middleware(request)

    exposed = response["Access-Control-Expose-Headers"]
    assert "X-Result-Truncated" in exposed
    assert "X-Result-Limit" in exposed
