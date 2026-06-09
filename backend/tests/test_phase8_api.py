import pytest
from django.contrib.auth import get_user_model

from apps.tenants.models import Institution


User = get_user_model()
pytestmark = pytest.mark.django_db


def _login(api_client, phone, password):
    response = api_client.post(
        "/api/v1/auth/login/",
        {"phone": phone, "password": password},
        format="json",
    )
    assert response.status_code == 200
    return response.json()["access"]


@pytest.mark.django_db
def test_phase8_superadmin_institution_lifecycle(api_client):
    superadmin = User.objects.create_user(
        phone="+998909300030",
        full_name="Super Admin",
        role="superadmin",
        password="secret123",
        is_staff=True,
    )
    access = _login(api_client, superadmin.phone, "secret123")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    create_response = api_client.post(
        "/api/v1/superadmin/institutions/",
        {
            "name": "New Academy",
            "slug": "new_academy",
            "domain": "new-academy.localhost",
            "director_phone": "+998909300031",
            "director_full_name": "Tenant Director",
            "director_password": "secret123",
        },
        format="json",
    )
    assert create_response.status_code == 201
    institution_id = create_response.json()["id"]
    assert Institution.objects.filter(schema_name="new_academy").exists()

    list_response = api_client.get("/api/v1/superadmin/institutions/")
    assert list_response.status_code == 200

    freeze_response = api_client.patch(
        f"/api/v1/superadmin/institutions/{institution_id}/freeze/",
        {"message": "Payment overdue"},
        format="json",
    )
    assert freeze_response.status_code == 200
    assert freeze_response.json()["status"] == "frozen"

    notify_response = api_client.post(
        f"/api/v1/superadmin/institutions/{institution_id}/notify/",
        {"title": "Freeze warning", "body": "Please contact support."},
        format="json",
    )
    assert notify_response.status_code == 201

    logs_response = api_client.get("/api/v1/superadmin/logs/")
    assert logs_response.status_code == 200

    unfreeze_response = api_client.patch(
        f"/api/v1/superadmin/institutions/{institution_id}/unfreeze/",
        {"message": "Resolved"},
        format="json",
    )
    assert unfreeze_response.status_code == 200
    assert unfreeze_response.json()["status"] == "active"

