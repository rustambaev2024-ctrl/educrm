import pytest
from django.contrib.auth import get_user_model
from django.db import connection

from apps.institutions.models import Branch
from apps.staff.models import Staff


User = get_user_model()
pytestmark = pytest.mark.skipif(
    not hasattr(connection, "set_schema"),
    reason="Phase 1 integration tests require django-tenants PostgreSQL backend.",
)


def _login(api_client, phone, password):
    return api_client.post(
        "/api/v1/auth/login/",
        {"phone": phone, "password": password},
        format="json",
    )


@pytest.mark.django_db
def test_director_can_crud_branches(api_client):
    director = User.objects.create_user(
        phone="+998902222221",
        full_name="Director User",
        role="director",
        password="secret123",
    )
    login_response = _login(api_client, director.phone, "secret123")
    access = login_response.json()["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    create_response = api_client.post(
        "/api/v1/branches/",
        {"name": "Central Branch", "address": "Tashkent", "phone": "+998900000000"},
        format="json",
    )
    assert create_response.status_code == 201
    branch_id = create_response.json()["id"]

    update_response = api_client.put(
        f"/api/v1/branches/{branch_id}/",
        {
            "name": "Central Branch 2",
            "address": "New address",
            "phone": "+998900000001",
            "status": "active",
        },
        format="json",
    )
    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Central Branch 2"

    delete_response = api_client.delete(f"/api/v1/branches/{branch_id}/")
    assert delete_response.status_code == 204


@pytest.mark.django_db
def test_branch_admin_can_only_list_own_branch(api_client):
    branch_a = Branch.objects.create(name="A", address="A", phone="1")
    branch_b = Branch.objects.create(name="B", address="B", phone="2")

    admin_user = User.objects.create_user(
        phone="+998902222222",
        full_name="Branch Admin",
        role="admin",
        password="secret123",
    )
    Staff.objects.create(user=admin_user, branch=branch_a)

    login_response = _login(api_client, admin_user.phone, "secret123")
    access = login_response.json()["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    forbidden_create = api_client.post("/api/v1/branches/", {"name": "C"}, format="json")
    assert forbidden_create.status_code == 403

    list_response = api_client.get("/api/v1/branches/")
    assert list_response.status_code == 200
    ids = {item["id"] for item in list_response.json()}
    assert str(branch_a.id) in ids
    assert str(branch_b.id) not in ids


@pytest.mark.django_db
def test_director_can_create_staff(api_client):
    branch = Branch.objects.create(name="A", address="A", phone="1")
    director = User.objects.create_user(
        phone="+998902222223",
        full_name="Director User",
        role="director",
        password="secret123",
    )
    login_response = _login(api_client, director.phone, "secret123")
    access = login_response.json()["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    response = api_client.post(
        "/api/v1/staff/",
        {
            "full_name": "Teacher One",
            "phone": "+998903333331",
            "role": "teacher",
            "password": "secret123",
            "branch": str(branch.id),
            "status": "active",
        },
        format="json",
    )
    assert response.status_code == 201
    assert Staff.objects.count() == 1
    assert Staff.objects.first().user.role == "teacher"


@pytest.mark.django_db
def test_branch_admin_sees_staff_only_from_own_branch(api_client):
    branch_a = Branch.objects.create(name="A", address="A", phone="1")
    branch_b = Branch.objects.create(name="B", address="B", phone="2")

    admin_user = User.objects.create_user(
        phone="+998902222224",
        full_name="Branch Admin",
        role="admin",
        password="secret123",
    )
    Staff.objects.create(user=admin_user, branch=branch_a)

    teacher_a = User.objects.create_user(
        phone="+998903333332",
        full_name="Teacher A",
        role="teacher",
        password="secret123",
    )
    Staff.objects.create(user=teacher_a, branch=branch_a)

    teacher_b = User.objects.create_user(
        phone="+998903333333",
        full_name="Teacher B",
        role="teacher",
        password="secret123",
    )
    Staff.objects.create(user=teacher_b, branch=branch_b)

    login_response = _login(api_client, admin_user.phone, "secret123")
    access = login_response.json()["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    response = api_client.get("/api/v1/staff/")
    assert response.status_code == 200
    payload = response.json()
    branch_ids = {row["branch"] for row in payload}
    assert branch_ids == {str(branch_a.id)}
