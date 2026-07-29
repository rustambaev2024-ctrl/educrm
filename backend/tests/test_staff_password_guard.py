"""T-014 / R-18: branch_admin не может сменить пароль директора через PATCH /staff/<id>/."""
import pytest
from django.contrib.auth import get_user_model

from apps.institutions.models import Branch
from apps.staff.models import Staff

User = get_user_model()
pytestmark = pytest.mark.django_db

OLD = "secret123"
NEW = "Hijacked!2026"


def _auth(api_client, user, password=OLD):
    response = api_client.post(
        "/api/v1/auth/login/",
        {"phone": user.phone, "password": password},
        format="json",
    )
    assert response.status_code == 200, response.json()
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['access']}")


@pytest.fixture
def env():
    branch = Branch.objects.create(name="Main", address="A", phone="+998901444001")
    other_branch = Branch.objects.create(name="Second", address="B", phone="+998901444002")

    def mk(phone, name, role, br=branch):
        user = User.objects.create_user(phone=phone, full_name=name, role=role, password=OLD)
        return user, Staff.objects.create(user=user, branch=br)

    director_user, director_staff = mk("+998909700001", "Director", "director")
    admin_user, admin_staff = mk("+998909700002", "Admin", "branch_admin")
    teacher_user, teacher_staff = mk("+998909700003", "Teacher", "teacher")
    foreign_teacher_user, foreign_teacher_staff = mk(
        "+998909700004", "Foreign Teacher", "teacher", other_branch
    )
    return {
        "director_user": director_user,
        "director_staff": director_staff,
        "admin_user": admin_user,
        "admin_staff": admin_staff,
        "teacher_user": teacher_user,
        "teacher_staff": teacher_staff,
        "foreign_teacher_user": foreign_teacher_user,
        "foreign_teacher_staff": foreign_teacher_staff,
    }


def test_branch_admin_cannot_change_director_password(api_client, env):
    _auth(api_client, env["admin_user"])
    response = api_client.patch(
        f"/api/v1/staff/{env['director_staff'].id}/",
        {"password": NEW},
        format="json",
    )
    assert response.status_code == 403, response.json()
    assert set(response.json()["detail"]) == {"uz", "ru"}

    env["director_user"].refresh_from_db()
    assert env["director_user"].check_password(OLD)
    assert not env["director_user"].check_password(NEW)


def test_branch_admin_cannot_change_another_branch_admin_password(api_client, env):
    peer_user = User.objects.create_user(
        phone="+998909700005", full_name="Peer Admin", role="branch_admin", password=OLD
    )
    peer_staff = Staff.objects.create(user=peer_user, branch=env["admin_staff"].branch)

    _auth(api_client, env["admin_user"])
    response = api_client.patch(
        f"/api/v1/staff/{peer_staff.id}/", {"password": NEW}, format="json"
    )
    assert response.status_code == 403
    peer_user.refresh_from_db()
    assert peer_user.check_password(OLD)


def test_branch_admin_cannot_change_teacher_from_other_branch(api_client, env):
    _auth(api_client, env["admin_user"])
    response = api_client.patch(
        f"/api/v1/staff/{env['foreign_teacher_staff'].id}/",
        {"password": NEW},
        format="json",
    )
    # Чужой филиал вне queryset -> 404; свой филиал с запретной ролью -> 403.
    assert response.status_code in (403, 404)
    env["foreign_teacher_user"].refresh_from_db()
    assert env["foreign_teacher_user"].check_password(OLD)


def test_branch_admin_can_still_reset_own_branch_teacher(api_client, env):
    """Легитимный путь: админ филиала сбрасывает пароль своему учителю."""
    _auth(api_client, env["admin_user"])
    response = api_client.patch(
        f"/api/v1/staff/{env['teacher_staff'].id}/",
        {"password": NEW},
        format="json",
    )
    assert response.status_code == 200, response.json()
    env["teacher_user"].refresh_from_db()
    assert env["teacher_user"].check_password(NEW)


def test_director_can_still_reset_staff_password(api_client, env):
    """Легитимный путь: директор сбрасывает пароль сотруднику."""
    _auth(api_client, env["director_user"])
    response = api_client.patch(
        f"/api/v1/staff/{env['admin_staff'].id}/",
        {"password": NEW},
        format="json",
    )
    assert response.status_code == 200, response.json()
    env["admin_user"].refresh_from_db()
    assert env["admin_user"].check_password(NEW)


def test_director_cannot_change_another_director_password(api_client, env):
    peer_director = User.objects.create_user(
        phone="+998909700006", full_name="Peer Director", role="director", password=OLD
    )
    peer_staff = Staff.objects.create(user=peer_director, branch=env["director_staff"].branch)

    _auth(api_client, env["director_user"])
    response = api_client.patch(
        f"/api/v1/staff/{peer_staff.id}/", {"password": NEW}, format="json"
    )
    assert response.status_code == 403
    peer_director.refresh_from_db()
    assert peer_director.check_password(OLD)


def test_patch_without_password_field_is_untouched(api_client, env):
    """Гард срабатывает только на password — остальные правки не ломаются."""
    _auth(api_client, env["admin_user"])
    response = api_client.patch(
        f"/api/v1/staff/{env['teacher_staff'].id}/",
        {"passport_number": "AA1234567"},
        format="json",
    )
    assert response.status_code == 200, response.json()
    env["teacher_staff"].refresh_from_db()
    assert env["teacher_staff"].passport_number == "AA1234567"
