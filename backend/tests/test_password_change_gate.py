"""T-026 / R-23: с непогашенным временным паролем через API не поработаешь.

T-015 завёл `User.must_change_password`, но флаг ни на что не влиял: сотрудник
с паролем, который ему выдал и знает администратор, мог работать бессрочно.

Открытым остаётся ровно необходимое, чтобы снять замок изнутри: логин,
`GET /auth/me/`, `POST /auth/change-password/`, `POST /auth/logout/`.
"""
import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings

from apps.accounts.authentication import CHANGE_REQUIRED_CODE
from apps.institutions.models import Branch

User = get_user_model()
pytestmark = pytest.mark.django_db

OLD = "secret123"
NEW = "Yangi!Parol2026"
GATED_PATH = "/api/v1/branches/"


def _login(api_client, user, password=OLD):
    response = api_client.post(
        "/api/v1/auth/login/",
        {"phone": user.phone, "password": password},
        format="json",
    )
    assert response.status_code == 200, response.json()
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['access']}")
    return response.json()


@pytest.fixture
def branch():
    return Branch.objects.create(name="Main", address="A", phone="+998901444001")


def _make_user(phone, role, locked):
    user = User.objects.create_user(
        phone=phone, full_name=f"User {role}", role=role, password=OLD
    )
    user.must_change_password = locked
    user.save(update_fields=["must_change_password"])
    return user


@pytest.fixture
def locked_director(api_client, branch):
    user = _make_user("+998909700001", "director", locked=True)
    _login(api_client, user)
    return user


# ─── замок ────────────────────────────────────────────────────────────────────

def test_locked_user_cannot_use_api(api_client, locked_director):
    response = api_client.get(GATED_PATH)

    assert response.status_code == 403
    body = response.json()
    assert body["code"] == CHANGE_REQUIRED_CODE
    assert set(body["detail"]) == {"uz", "ru"}


def test_locked_user_cannot_write(api_client, locked_director):
    response = api_client.post(
        GATED_PATH,
        {"name": "New", "address": "B", "phone": "+998901444002"},
        format="json",
    )

    assert response.status_code == 403
    assert response.json()["code"] == CHANGE_REQUIRED_CODE
    assert Branch.objects.filter(name="New").exists() is False


@pytest.mark.parametrize(
    "role",
    ["superadmin", "director", "branch_admin", "teacher", "support_teacher",
     "student", "parent"],
)
def test_gate_applies_to_every_role(api_client, branch, role):
    """Гейт не должен иметь привилегированных исключений — включая superadmin."""
    user = _make_user(f"+99890971{hash(role) % 10000:04d}", role, locked=True)
    _login(api_client, user)

    response = api_client.get(GATED_PATH)

    assert response.status_code == 403
    assert response.json()["code"] == CHANGE_REQUIRED_CODE


# ─── что остаётся открытым ────────────────────────────────────────────────────

def test_locked_user_can_read_self(api_client, locked_director):
    response = api_client.get("/api/v1/auth/me/")

    assert response.status_code == 200
    assert response.json()["must_change_password"] is True


def test_locked_user_cannot_patch_self(api_client, locked_director):
    """`/auth/me/` открыт только на чтение — иначе это обходной путь записи."""
    response = api_client.patch("/api/v1/auth/me/", {"full_name": "X"}, format="json")

    assert response.status_code == 403
    assert response.json()["code"] == CHANGE_REQUIRED_CODE


def test_locked_user_can_change_password_and_is_released(api_client, locked_director):
    changed = api_client.post(
        "/api/v1/auth/change-password/",
        {"old_password": OLD, "new_password": NEW},
        format="json",
    )
    assert changed.status_code == 200, changed.json()

    locked_director.refresh_from_db()
    assert locked_director.must_change_password is False
    # Тот же access-токен продолжает работать — замок снимается сразу,
    # перелогин не нужен.
    assert api_client.get(GATED_PATH).status_code == 200


def test_locked_user_can_log_out(api_client, branch):
    user = _make_user("+998909700002", "director", locked=True)
    tokens = _login(api_client, user)

    response = api_client.post(
        "/api/v1/auth/logout/", {"refresh": tokens["refresh"]}, format="json"
    )

    assert response.status_code == 200


def test_login_itself_is_not_blocked(api_client, branch):
    user = _make_user("+998909700003", "teacher", locked=True)
    response = api_client.post(
        "/api/v1/auth/login/", {"phone": user.phone, "password": OLD}, format="json"
    )

    assert response.status_code == 200
    assert response.json()["access"]


# ─── обычный пользователь не задет ────────────────────────────────────────────

def test_user_without_flag_works_as_before(api_client, branch):
    user = _make_user("+998909700004", "director", locked=False)
    _login(api_client, user)

    assert api_client.get(GATED_PATH).status_code == 200


def test_anonymous_request_is_still_401_not_403(api_client):
    """Гейт не должен подменять собой аутентификацию."""
    assert api_client.get(GATED_PATH).status_code == 401


# ─── аварийный выключатель ────────────────────────────────────────────────────

def test_gate_can_be_disabled_for_incident(api_client, locked_director):
    with override_settings(FORCE_PASSWORD_CHANGE=False):
        assert api_client.get(GATED_PATH).status_code == 200


def test_gate_is_enabled_by_default():
    from django.conf import settings

    assert settings.FORCE_PASSWORD_CHANGE is True
