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


class TestSendGuards:
    """Отправка не должна давать обойти проверку адреса через переадресацию."""

    def _send(self, monkeypatch, status_code):
        from apps.students import lidpixel

        captured = {}

        class _Resp:
            status_code = None
            text = "redirected"

        def _fake_post(url, **kwargs):
            captured.update(kwargs)
            resp = _Resp()
            resp.status_code = status_code
            return resp

        monkeypatch.setattr(lidpixel, "validate_status_url", lambda url: url)
        monkeypatch.setattr(lidpixel.requests, "post", _fake_post)
        result = lidpixel.send_status_event(
            url="https://leadpixel.example/status", key="k", payload={}
        )
        return result, captured

    def test_redirects_are_not_followed(self, monkeypatch):
        """Разрешённый хост может ответить 302 на внутренний адрес — без
        этого запрета requests пошёл бы туда уже без всякой проверки."""
        (ok, code, error), captured = self._send(monkeypatch, 302)

        assert captured["allow_redirects"] is False
        assert ok is False
        assert code == 302
        assert error

    def test_success_still_reported_ok(self, monkeypatch):
        (ok, code, error), _ = self._send(monkeypatch, 200)

        assert ok is True
        assert code == 200


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

    def test_lead_save_survives_failure_to_queue_the_event(self, monkeypatch):
        """Карточка заявки важнее уведомления: сбой постановки события не
        должен отменять сохранение статуса."""
        from apps.students.models import LeadStatusDelivery, StudentLead

        def _boom(*args, **kwargs):
            from django.db import IntegrityError

            raise IntegrityError("boom")

        lead = self._lead()
        monkeypatch.setattr("apps.students.lidpixel.queue_lead_event", _boom)

        lead.status = "contacted"
        lead.save(update_fields=["status", "updated_at"])

        assert StudentLead.objects.get(pk=lead.pk).status == "contacted"
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


class TestSaleEvent:
    @pytest.fixture(autouse=True)
    def _configured(self, monkeypatch):
        monkeypatch.setattr(
            "apps.students.lidpixel._current_institution", lambda: _institution()
        )

    def _lead_with_student(self, branch):
        from apps.students.models import StudentLead

        student = StudentFactory(branch=branch)
        lead = StudentLead.objects.create(
            full_name="Ali",
            phone="+998901112233",
            branch=branch,
            source="lidpixel",
            status="won",
            converted_student=student,
        )
        return lead, student

    def _pay(self, student, amount, payment_type="top_up", funding_source="main"):
        """Оплата ровно тем путём, которым её вводит сотрудник."""
        from apps.finance.serializers import PaymentCreateSerializer

        class _Req:
            user = UserFactory(role="director")

        serializer = PaymentCreateSerializer(
            data={
                "payment_type": payment_type,
                "amount": str(amount),
                "funding_source": funding_source,
            },
            context={"student": student, "request": _Req()},
        )
        serializer.is_valid(raise_exception=True)
        return serializer.save()

    def test_first_real_payment_creates_sale(self):
        from apps.students.models import LeadStatusDelivery

        branch = BranchFactory()
        lead, student = self._lead_with_student(branch)

        self._pay(student, Decimal("500000.00"))

        delivery = LeadStatusDelivery.objects.get(lead=lead, event="sale")
        assert delivery.payload["amount"] == "500000.00"

    def test_manual_top_up_also_counts(self):
        from apps.students.models import LeadStatusDelivery

        branch = BranchFactory()
        lead, student = self._lead_with_student(branch)

        self._pay(student, Decimal("300000.00"), payment_type="manual_top_up")

        assert LeadStatusDelivery.objects.filter(lead=lead, event="sale").exists()

    def test_bonus_grant_is_not_a_sale(self):
        from apps.students.models import LeadStatusDelivery

        branch = BranchFactory()
        lead, student = self._lead_with_student(branch)

        self._pay(student, Decimal("100000.00"), funding_source="bonus")

        assert not LeadStatusDelivery.objects.filter(lead=lead, event="sale").exists()

    def test_second_payment_does_not_create_second_sale(self):
        from apps.students.models import LeadStatusDelivery

        branch = BranchFactory()
        lead, student = self._lead_with_student(branch)

        self._pay(student, Decimal("500000.00"))
        self._pay(student, Decimal("200000.00"))

        assert LeadStatusDelivery.objects.filter(lead=lead, event="sale").count() == 1

    def test_reversal_generated_top_up_is_not_a_sale(self):
        """Сторно ручного списания создаёт manual_top_up внутри финансовой
        логики, минуя сериализатор. Именно поэтому хук стоит в сериализаторе,
        а не в сигнале модели Payment."""
        from apps.finance.services import apply_payment, reverse_payment
        from apps.students.models import LeadStatusDelivery

        branch = BranchFactory()
        lead, student = self._lead_with_student(branch)
        charge = apply_payment(
            student=student, payment_type="manual_charge", amount=Decimal("50000.00")
        ).payment

        reverse_payment(charge)

        assert not LeadStatusDelivery.objects.filter(lead=lead, event="sale").exists()

    def test_payment_survives_failure_to_queue_the_event(self, monkeypatch):
        """Уведомление LeadPixel не может стоить клиенту платежа.

        Гонка двух первых оплат реальна: обе проходят проверку «продажи ещё
        не было», обе вставляют запись, вторая ловит ограничение БД. Без
        этой защиты второй платёж упал бы с ошибкой.
        """
        from apps.finance.models import Payment
        from apps.students.models import LeadStatusDelivery

        branch = BranchFactory()
        lead, student = self._lead_with_student(branch)

        def _boom(*args, **kwargs):
            from django.db import IntegrityError

            raise IntegrityError("uniq_sale_delivery_per_lead")

        monkeypatch.setattr("apps.students.lidpixel.queue_lead_event", _boom)

        payment = self._pay(student, Decimal("500000.00"))

        assert Payment.objects.filter(id=payment.id).exists()
        assert payment.amount == Decimal("500000.00")
        assert not LeadStatusDelivery.objects.filter(lead=lead).exists()

    def test_student_without_lidpixel_lead_creates_nothing(self):
        from apps.students.models import LeadStatusDelivery

        branch = BranchFactory()
        student = StudentFactory(branch=branch)

        self._pay(student, Decimal("500000.00"))

        assert not LeadStatusDelivery.objects.exists()


class TestDelivery:
    def _pending(self):
        from apps.students.models import LeadStatusDelivery, StudentLead

        lead = StudentLead.objects.create(
            full_name="Ali",
            phone="+998901112233",
            branch=BranchFactory(),
            source="lidpixel",
            status="won",
        )
        return LeadStatusDelivery.objects.create(
            lead=lead, event="status_changed", payload={"event": "status_changed"}
        )

    def test_successful_send_marks_sent(self, monkeypatch):
        from apps.students import tasks

        monkeypatch.setattr(tasks, "send_status_event", lambda **kw: (True, 200, ""))
        delivery = self._pending()

        tasks.deliver_pending_for_institution(_institution())

        delivery.refresh_from_db()
        assert delivery.status == "sent"
        assert delivery.response_code == 200
        assert delivery.sent_at is not None

    def test_failure_schedules_retry(self, monkeypatch):
        from apps.students import tasks

        monkeypatch.setattr(tasks, "send_status_event", lambda **kw: (False, 500, "boom"))
        delivery = self._pending()
        before = delivery.next_attempt_at

        tasks.deliver_pending_for_institution(_institution())

        delivery.refresh_from_db()
        assert delivery.status == "pending"
        assert delivery.attempts == 1
        assert delivery.next_attempt_at > before
        assert delivery.last_error == "boom"

    def test_gives_up_after_five_attempts(self, monkeypatch):
        from apps.students import tasks

        monkeypatch.setattr(tasks, "send_status_event", lambda **kw: (False, 500, "boom"))
        delivery = self._pending()

        for _ in range(5):
            delivery.next_attempt_at = timezone.now()
            delivery.save(update_fields=["next_attempt_at"])
            tasks.deliver_pending_for_institution(_institution())
            delivery.refresh_from_db()

        assert delivery.status == "failed"
        assert delivery.attempts == 5

    def test_key_and_url_are_passed_to_sender(self, monkeypatch):
        from apps.students import tasks

        captured = {}

        def _fake(**kwargs):
            captured.update(kwargs)
            return True, 200, ""

        monkeypatch.setattr(tasks, "send_status_event", _fake)
        self._pending()

        tasks.deliver_pending_for_institution(_institution(key="the-key"))

        assert captured["key"] == "the-key"
        assert captured["url"] == "https://leadpixel.example/status"

    def test_not_due_delivery_is_skipped(self, monkeypatch):
        from datetime import timedelta

        from apps.students import tasks

        monkeypatch.setattr(tasks, "send_status_event", lambda **kw: (True, 200, ""))
        delivery = self._pending()
        delivery.next_attempt_at = timezone.now() + timedelta(hours=1)
        delivery.save(update_fields=["next_attempt_at"])

        tasks.deliver_pending_for_institution(_institution())

        delivery.refresh_from_db()
        assert delivery.status == "pending"
        assert delivery.attempts == 0


class TestSettingsEndpoints:
    """Успешное сохранение тестом не покрываем: request.tenant — настоящая
    Institution, которой на SQLite нет. Проверяем отказы, срабатывающие до
    обращения к тенанту, — и порядок проверок в коде обязан быть именно
    такой: сначала права, потом валидация адреса, потом сохранение."""

    def test_patch_rejects_unsafe_url(self, api_client):
        director = UserFactory(role="director")
        api_client.force_authenticate(user=director)

        response = api_client.patch(
            "/api/v1/branches/lidpixel-status-settings/",
            {"lidpixel_status_url": "http://localhost/status"},
            format="json",
        )

        assert response.status_code == 400, response.content

    def test_non_director_is_denied(self, api_client):
        teacher = UserFactory(role="teacher")
        api_client.force_authenticate(user=teacher)

        response = api_client.get("/api/v1/branches/lidpixel-status-settings/")

        assert response.status_code == 403, response.content
