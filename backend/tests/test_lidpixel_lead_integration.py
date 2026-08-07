"""Входящий вебхук LidPixel — авторизация по API-ключу, не по заголовку схемы.

Требует настоящий django-tenants/PostgreSQL backend (создание Institution со
своей схемой), поэтому — как и test_phase8_api.py — пропускается под SQLite
test harness. Держим этот файл как исполняемую спецификацию: прогоняется
вручную/на CI с Postgres.
"""
import pytest
from django_tenants.utils import schema_context

from apps.tenants.models import Institution

pytestmark = [
    pytest.mark.django_db,
    pytest.mark.skip(reason="Requires django-tenants PostgreSQL backend."),
]

LIDPIXEL_URL = "/api/v1/public/leads/lidpixel/"


def _institution_with_key(schema_name="lidpixel_test", key="test-key-123"):
    institution = Institution.objects.create(
        name="LidPixel Test School",
        schema_name=schema_name,
        slug=schema_name,
        lead_api_key=key,
    )
    return institution


def test_valid_key_creates_lead(api_client):
    institution = _institution_with_key()
    response = api_client.post(
        LIDPIXEL_URL,
        {"full_name": "Aliyev Vali", "phone": "+998901234567"},
        format="json",
        HTTP_X_API_KEY=institution.lead_api_key,
    )
    assert response.status_code == 201
    with schema_context(institution.schema_name):
        from apps.students.models import StudentLead

        lead = StudentLead.objects.get(id=response.json()["id"])
        assert lead.source == "lidpixel"
        assert lead.phone == "+998901234567"


def test_field_aliases_map_correctly(api_client):
    institution = _institution_with_key(schema_name="lidpixel_aliases", key="alias-key")
    response = api_client.post(
        LIDPIXEL_URL,
        {"name": "Boyeva Feruza", "telephone": "+998901112233"},
        format="json",
        HTTP_X_API_KEY=institution.lead_api_key,
    )
    assert response.status_code == 201
    with schema_context(institution.schema_name):
        from apps.students.models import StudentLead

        lead = StudentLead.objects.get(id=response.json()["id"])
        assert lead.full_name == "Boyeva Feruza"
        assert lead.phone == "+998901112233"


def test_missing_key_rejected(api_client):
    response = api_client.post(
        LIDPIXEL_URL,
        {"full_name": "No Key", "phone": "+998900000000"},
        format="json",
    )
    assert response.status_code == 401


def test_wrong_key_rejected(api_client):
    _institution_with_key(schema_name="lidpixel_wrong", key="real-key")
    response = api_client.post(
        LIDPIXEL_URL,
        {"full_name": "Wrong Key", "phone": "+998900000000"},
        format="json",
        HTTP_X_API_KEY="not-the-real-key",
    )
    assert response.status_code == 401


def test_missing_phone_rejected(api_client):
    institution = _institution_with_key(schema_name="lidpixel_nophone", key="nophone-key")
    response = api_client.post(
        LIDPIXEL_URL,
        {"full_name": "No Phone"},
        format="json",
        HTTP_X_API_KEY=institution.lead_api_key,
    )
    assert response.status_code == 400


def test_key_passed_as_query_param(api_client):
    institution = _institution_with_key(schema_name="lidpixel_query", key="query-key")
    response = api_client.post(
        f"{LIDPIXEL_URL}?key={institution.lead_api_key}",
        {"full_name": "Query Param", "phone": "+998900000001"},
        format="json",
    )
    assert response.status_code == 201


def test_regenerated_key_invalidates_old_one(api_client):
    institution = _institution_with_key(schema_name="lidpixel_regen", key="old-key")
    institution.lead_api_key = "new-key"
    institution.save(update_fields=["lead_api_key"])

    response = api_client.post(
        LIDPIXEL_URL,
        {"full_name": "Old Key", "phone": "+998900000002"},
        format="json",
        HTTP_X_API_KEY="old-key",
    )
    assert response.status_code == 401
