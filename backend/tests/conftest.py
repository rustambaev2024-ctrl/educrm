import pytest
from unittest.mock import patch, MagicMock
from rest_framework.test import APIClient


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


class _FakeTenant:
    """Minimal tenant object for SQLite tests (no real multi-tenancy)."""
    schema_name = "public"
    meta_pixel_id = None
    meta_access_token = None
    sms_enabled = False
    sms_email = ""
    sms_password = ""
    sms_sender = ""

    def save(self, **kwargs):
        pass

    def __str__(self):
        return "test-tenant"


class _FakeInstitution:
    @classmethod
    def objects(cls):
        return MagicMock()


@pytest.fixture(autouse=True, scope="session")
def _disable_tenant_delete_signal():
    """
    django_tenants registers a @receiver(post_delete) that calls get_tenant_model()
    on every model delete. This fails under SQLite because 'tenants' is not in
    INSTALLED_APPS. Disconnect the signal for the whole test session.
    """
    from django.db.models.signals import post_delete
    from django_tenants.signals import tenant_delete_callback
    post_delete.disconnect(tenant_delete_callback)


@pytest.fixture(autouse=True)
def _patch_tenant_infra(db):
    """
    Patch all django_tenants-related calls that break under SQLite.
    """
    fake_tenant = _FakeTenant()

    def _fake_resolve(self, phone, request):
        return fake_tenant

    with patch("apps.accounts.views.LoginView._resolve_tenant_by_phone", _fake_resolve), \
         patch("apps.accounts.views.connection", schema_name="public", set_tenant=MagicMock()), \
         patch("apps.accounts.serializers.connection", schema_name="public"), \
         patch("apps.institutions.views.connection", schema_name="public"), \
         patch("apps.institutions.views.Institution", _FakeInstitution), \
         patch("apps.institutions.serializers.Institution", _FakeInstitution):
        yield
