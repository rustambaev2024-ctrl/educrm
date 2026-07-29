"""T-018 / R-24: глобальная пагинация списков без обрушения существующего контракта."""
import pytest
from django.contrib.auth import get_user_model

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
    from apps.core.pagination import OptInPageNumberPagination

    assert OptInPageNumberPagination.max_page_size == 1000
    assert OptInPageNumberPagination.MAX_UNPAGINATED == 1000
