"""T-015 / R-23: нет дефолтного пароля, включена парольная политика,
временный пароль помечает аккаунт как требующий смены."""
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth import get_user_model

from apps.institutions.models import Branch
from apps.staff.models import Staff

User = get_user_model()
pytestmark = pytest.mark.django_db

STRONG = "Kuchli!Parol2026"
OLD = "secret123"


def _auth(api_client, user, password=OLD):
    response = api_client.post(
        "/api/v1/auth/login/",
        {"phone": user.phone, "password": password},
        format="json",
    )
    assert response.status_code == 200, response.json()
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['access']}")


@pytest.fixture
def staff_create_ready():
    """`StaffSerializer.validate_phone` ходит по схемам тенантов — под SQLite их нет."""
    fake_tenant_model = MagicMock()
    fake_tenant_model.objects.exclude.return_value = []
    with patch("django.db.connection", MagicMock(schema_name="public")):
        with patch(
            "django_tenants.utils.get_tenant_model", return_value=fake_tenant_model
        ):
            yield


@pytest.fixture
def director(api_client):
    branch = Branch.objects.create(name="Main", address="A", phone="+998901333001")
    user = User.objects.create_user(
        phone="+998909800001", full_name="Director", role="director", password=OLD
    )
    Staff.objects.create(user=user, branch=branch)
    _auth(api_client, user)
    return {"user": user, "branch": branch}


def test_no_changeme_literal_left_in_backend():
    """R-23: общий дефолтный пароль не должен существовать в коде вообще."""
    import pathlib

    root = pathlib.Path(__file__).resolve().parents[1] / "apps"
    hits = [
        str(path)
        for path in root.rglob("*.py")
        if '"ChangeMe123"' in path.read_text(encoding="utf-8", errors="ignore")
    ]
    assert hits == []


def test_password_validators_are_enabled():
    from django.conf import settings

    names = {item["NAME"].rsplit(".", 1)[-1] for item in settings.AUTH_PASSWORD_VALIDATORS}
    assert {
        "MinimumLengthValidator",
        "CommonPasswordValidator",
        "NumericPasswordValidator",
        "UserAttributeSimilarityValidator",
    } <= names


def test_staff_created_without_password_gets_unique_generated_one(api_client, director, staff_create_ready):
    payloads = []
    for i in range(2):
        response = api_client.post(
            "/api/v1/staff/",
            {
                "full_name": f"Teacher {i}",
                "phone": f"+99890981000{i}",
                "role": "teacher",
                "branch": str(director["branch"].id),
            },
            format="json",
        )
        assert response.status_code == 201, response.json()
        payloads.append(response.json())

    first, second = payloads
    assert first["generated_password"]
    assert len(first["generated_password"]) >= 12
    # Пароли разных сотрудников не совпадают — общего литерала больше нет.
    assert first["generated_password"] != second["generated_password"]

    created = User.objects.get(id=first["user_id"])
    assert created.check_password(first["generated_password"])
    assert created.must_change_password is True


def test_weak_password_is_rejected_bilingually(api_client, director, staff_create_ready):
    response = api_client.post(
        "/api/v1/staff/",
        {
            "full_name": "Weak",
            "phone": "+998908920001",
            "role": "teacher",
            "branch": str(director["branch"].id),
            "password": "1234",
        },
        format="json",
    )
    assert response.status_code == 400, response.json()
    detail = response.json()["detail"]
    assert set(detail) >= {"uz", "ru"}
    assert not User.objects.filter(phone="+998908920001").exists()


def test_strong_password_is_accepted(api_client, director, staff_create_ready):
    response = api_client.post(
        "/api/v1/staff/",
        {
            "full_name": "Strong",
            "phone": "+998908930001",
            "role": "teacher",
            "branch": str(director["branch"].id),
            "password": STRONG,
        },
        format="json",
    )
    assert response.status_code == 201, response.json()
    assert "generated_password" not in response.json()
    assert User.objects.get(phone="+998908930001").check_password(STRONG)


def test_admin_reset_sets_flag_and_self_change_clears_it(api_client, director):
    target = User.objects.create_user(
        phone="+998908940001", full_name="Teacher", role="teacher", password=OLD
    )
    Staff.objects.create(user=target, branch=director["branch"])

    response = api_client.post(
        "/api/v1/auth/reset-password/",
        {"user_id": str(target.id), "new_password": STRONG},
        format="json",
    )
    assert response.status_code == 200, response.json()
    target.refresh_from_db()
    assert target.must_change_password is True

    # Владелец аккаунта меняет пароль сам — требование снимается.
    api_client.credentials()
    _auth(api_client, target, STRONG)
    changed = api_client.post(
        "/api/v1/auth/change-password/",
        {"old_password": STRONG, "new_password": "Yangi!Parol2026"},
        format="json",
    )
    assert changed.status_code == 200, changed.json()
    target.refresh_from_db()
    assert target.must_change_password is False


def test_weak_password_rejected_on_self_change(api_client, director):
    response = api_client.post(
        "/api/v1/auth/change-password/",
        {"old_password": OLD, "new_password": "11111111"},
        format="json",
    )
    assert response.status_code == 400
    assert set(response.json()["detail"]) >= {"uz", "ru"}


def test_me_exposes_must_change_password(api_client, director):
    response = api_client.get("/api/v1/auth/me/")
    assert response.status_code == 200
    assert response.json()["must_change_password"] is False
