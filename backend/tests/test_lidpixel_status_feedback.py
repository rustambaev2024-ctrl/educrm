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


class TestStatusUrlSafety:
    @pytest.mark.parametrize(
        "url",
        [
            "http://leadpixel.example/status",
            "https://localhost/status",
            "https://127.0.0.1/status",
            "https://10.0.0.5/status",
            "https://169.254.169.254/status",
            "ftp://leadpixel.example/status",
            "",
        ],
    )
    def test_unsafe_urls_rejected(self, url):
        from apps.students.lidpixel import UnsafeStatusUrl, validate_status_url

        with pytest.raises(UnsafeStatusUrl):
            validate_status_url(url)

    def test_public_https_url_accepted(self, monkeypatch):
        """Разрешение имени подменяем: иначе тест зависел бы от наличия сети
        и от того, куда сегодня резолвится внешний домен."""
        import socket as socket_module

        from apps.students import lidpixel

        monkeypatch.setattr(
            lidpixel.socket,
            "getaddrinfo",
            lambda *a, **kw: [
                (socket_module.AF_INET, None, None, "", ("93.184.216.34", 0))
            ],
        )

        assert (
            lidpixel.validate_status_url("https://example.com/status")
            == "https://example.com/status"
        )


class TestPayload:
    def _lead(self, **kwargs):
        from apps.students.models import StudentLead

        defaults = {
            "full_name": "Ali",
            "phone": "+998901112233",
            "branch": BranchFactory(),
            "source": "lidpixel",
        }
        defaults.update(kwargs)
        return StudentLead.objects.create(**defaults)

    def test_status_payload_shape(self):
        from apps.students.lidpixel import build_lidpixel_payload

        lead = self._lead(external_id="LP-7", status="contacted")

        payload = build_lidpixel_payload(
            event="status_changed", lead=lead, currency="UZS"
        )

        assert payload["event"] == "status_changed"
        assert payload["lead_id"] == "LP-7"
        assert payload["crm_lead_id"] == str(lead.id)
        assert payload["status"] == "contacted"
        assert payload["amount"] is None
        assert payload["currency"] == "UZS"
        assert payload["occurred_at"]

    def test_sale_payload_carries_amount_as_string(self):
        from apps.students.lidpixel import build_lidpixel_payload

        lead = self._lead(status="won")

        payload = build_lidpixel_payload(
            event="sale", lead=lead, amount=Decimal("500000.00"), currency="UZS"
        )

        assert payload["event"] == "sale"
        assert payload["amount"] == "500000.00"
        assert payload["lead_id"] == "", "внешнего номера нет — шлём пустую строку, не None"


class TestStatusChangeEvents:
    @pytest.fixture(autouse=True)
    def _configured(self, monkeypatch):
        monkeypatch.setattr(
            "apps.students.lidpixel._current_institution", lambda: _institution()
        )

    def _lead(self, **kwargs):
        from apps.students.models import StudentLead

        defaults = {
            "full_name": "Ali",
            "phone": "+998901112233",
            "branch": BranchFactory(),
            "source": "lidpixel",
        }
        defaults.update(kwargs)
        return StudentLead.objects.create(**defaults)

    def test_status_change_creates_event(self):
        from apps.students.models import LeadStatusDelivery

        lead = self._lead()
        lead.status = "contacted"
        lead.save(update_fields=["status", "updated_at"])

        delivery = LeadStatusDelivery.objects.get(lead=lead, event="status_changed")
        assert delivery.payload["status"] == "contacted"
        assert delivery.status == "pending"

    def test_creating_lead_does_not_create_event(self):
        from apps.students.models import LeadStatusDelivery

        lead = self._lead()

        assert not LeadStatusDelivery.objects.filter(lead=lead).exists()

    def test_save_without_status_change_creates_nothing(self):
        from apps.students.models import LeadStatusDelivery

        lead = self._lead()
        lead.notes = "перезвонить"
        lead.save(update_fields=["notes", "updated_at"])

        assert not LeadStatusDelivery.objects.filter(lead=lead).exists()

    def test_other_source_creates_nothing(self):
        from apps.students.models import LeadStatusDelivery

        lead = self._lead(source="walk_in")
        lead.status = "contacted"
        lead.save(update_fields=["status", "updated_at"])

        assert not LeadStatusDelivery.objects.filter(lead=lead).exists()

    def test_no_event_when_url_not_configured(self, monkeypatch):
        from apps.students.models import LeadStatusDelivery

        monkeypatch.setattr(
            "apps.students.lidpixel._current_institution",
            lambda: _institution(url=""),
        )
        lead = self._lead()
        lead.status = "won"
        lead.save(update_fields=["status", "updated_at"])

        assert not LeadStatusDelivery.objects.filter(lead=lead).exists()

    def test_conversion_save_queues_won_event(self):
        """Перевод заявки в ученики идёт через save(update_fields=[...]).

        Сигнал обязан сработать и на таком сохранении — иначе самое важное
        событие («поступил») никогда не уйдёт.
        """
        from apps.students.models import LeadStatusDelivery

        branch = BranchFactory()
        lead = self._lead(branch=branch)
        student = StudentFactory(branch=branch)

        lead.status = "won"
        lead.converted_student = student
        lead.save(update_fields=["status", "converted_student", "updated_at"])

        delivery = LeadStatusDelivery.objects.get(lead=lead, event="status_changed")
        assert delivery.payload["status"] == "won"
        lead.refresh_from_db()
        assert lead.converted_student_id == student.id
