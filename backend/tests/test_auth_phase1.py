import pytest
from django.contrib.auth import get_user_model


User = get_user_model()
pytestmark = pytest.mark.django_db


def _login(api_client, phone, password):
    response = api_client.post(
        "/api/v1/auth/login/",
        {"phone": phone, "password": password},
        format="json",
    )
    return response


@pytest.mark.django_db
def test_login_returns_tokens_and_user_payload(api_client):
    user = User.objects.create_user(
        phone="+998901111111",
        full_name="Director User",
        role="director",
        password="secret123",
    )

    response = _login(api_client, user.phone, "secret123")

    assert response.status_code == 200
    payload = response.json()
    assert payload["access"]
    assert payload["refresh"]
    assert payload["user"]["id"] == str(user.id)
    assert payload["user"]["fullName"] == user.full_name
    assert payload["user"]["role"] == "director"
    assert user.sessions.count() == 1


@pytest.mark.django_db
def test_change_password(api_client):
    user = User.objects.create_user(
        phone="+998901111112",
        full_name="Teacher User",
        role="teacher",
        password="secret123",
    )

    login_response = _login(api_client, user.phone, "secret123")
    access = login_response.json()["access"]

    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    response = api_client.post(
        "/api/v1/auth/change-password/",
        {"old_password": "secret123", "new_password": "newsecret123"},
        format="json",
    )

    assert response.status_code == 200
    relogin_response = _login(api_client, user.phone, "newsecret123")
    assert relogin_response.status_code == 200


@pytest.mark.django_db
def test_logout_blacklists_refresh_token_and_disables_session(api_client):
    user = User.objects.create_user(
        phone="+998901111113",
        full_name="Admin User",
        role="admin",
        password="secret123",
    )

    login_response = _login(api_client, user.phone, "secret123")
    access = login_response.json()["access"]
    refresh = login_response.json()["refresh"]

    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    response = api_client.post("/api/v1/auth/logout/", {"refresh": refresh}, format="json")

    assert response.status_code == 200
    assert user.sessions.filter(is_active=True).count() == 0


@pytest.mark.django_db
def test_branch_admin_can_reset_another_user_password(api_client):
    admin_user = User.objects.create_user(
        phone="+998901111114",
        full_name="Branch Admin",
        role="admin",
        password="secret123",
    )
    teacher_user = User.objects.create_user(
        phone="+998901111115",
        full_name="Teacher User",
        role="teacher",
        password="secret123",
    )

    login_response = _login(api_client, admin_user.phone, "secret123")
    access = login_response.json()["access"]

    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    response = api_client.post(
        "/api/v1/auth/reset-password/",
        {"user_id": str(teacher_user.id), "new_password": "resetpass123"},
        format="json",
    )

    assert response.status_code == 200
    relogin_response = _login(api_client, teacher_user.phone, "resetpass123")
    assert relogin_response.status_code == 200
