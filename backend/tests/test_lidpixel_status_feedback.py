import pytest
from decimal import Decimal

from django.utils import timezone

from tests.factories import BranchFactory, StudentFactory, UserFactory

pytestmark = pytest.mark.django_db


def _institution(**overrides):
    """Заглушка организации для проверок, которым нужны только настройки.

    Настоящую Institution в тестах не создаём: это модель django-tenants,
    её save() пытается создать схему в БД, а тесты идут на SQLite.
    """

    class _Inst:
        lidpixel_status_url = overrides.get("url", "https://leadpixel.example/status")
        lidpixel_status_key = overrides.get("key", "secret-key")
        currency = overrides.get("currency", "UZS")
        schema_name = overrides.get("schema_name", "demo")

    return _Inst()


class TestWebhookExternalId:
    @pytest.mark.parametrize("field", ["id", "lead_id", "leadgen_id"])
    def test_external_id_read_from_each_alias(self, field):
        from apps.students.views import _lidpixel_external_id

        assert _lidpixel_external_id({field: "LP-42"}) == "LP-42"

    def test_external_id_empty_when_absent(self):
        from apps.students.views import _lidpixel_external_id

        assert _lidpixel_external_id({"name": "Ali"}) == ""

    def test_external_id_is_stringified(self):
        from apps.students.views import _lidpixel_external_id

        assert _lidpixel_external_id({"id": 42}) == "42"


class TestDeliveryModel:
    def _lead(self):
        from apps.students.models import StudentLead

        return StudentLead.objects.create(
            full_name="Ali",
            phone="+998901112233",
            branch=BranchFactory(),
            source="lidpixel",
        )

    def test_only_one_sale_delivery_per_lead(self):
        from django.db import IntegrityError

        from apps.students.models import LeadStatusDelivery

        lead = self._lead()
        LeadStatusDelivery.objects.create(lead=lead, event="sale", payload={})

        with pytest.raises(IntegrityError):
            LeadStatusDelivery.objects.create(lead=lead, event="sale", payload={})

    def test_two_status_deliveries_are_allowed(self):
        from apps.students.models import LeadStatusDelivery

        lead = self._lead()
        LeadStatusDelivery.objects.create(lead=lead, event="status_changed", payload={})
        LeadStatusDelivery.objects.create(lead=lead, event="status_changed", payload={})

        assert LeadStatusDelivery.objects.filter(lead=lead).count() == 2
