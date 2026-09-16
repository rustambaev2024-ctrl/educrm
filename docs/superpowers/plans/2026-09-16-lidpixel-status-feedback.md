# LeadPixel: обратная передача статусов и продаж — план реализации

> **Для агентных исполнителей:** ОБЯЗАТЕЛЬНЫЙ ПОДСКИЛ: superpowers:subagent-driven-development.
> Шаги отмечены чекбоксами `- [ ]`.

**Цель:** EduCRM сама сообщает LeadPixel о смене статуса заявки и о первой
оплате ученика, чтобы его дашборд считал продажи и окупаемость рекламы.

**Архитектура:** События пишутся в журнал (`LeadStatusDelivery`) в той же
транзакции, что и действие пользователя; отдельная Celery-задача раз в минуту
разносит их по организациям с повторами при сбое. Тело запроса собирает одна
функция — под формат LeadPixel правится только она.

**Стек:** Django + DRF, Celery (beat уже настроен), `requests`, React.

Спека: `docs/superpowers/specs/2026-09-11-lidpixel-status-feedback-design.md`
Ветка: `feature/lidpixel-status-feedback` (создана, спека закоммичена `835c8b8`).

**Команды проекта:** тесты — `python -m pytest backend/tests/... -v` из корня
(НЕ `manage.py test`); `manage.py` — из `backend/`. Базовый уровень, который
НЕ считается регрессией: 24 падающих бэкенд-теста в чужих файлах, 21 ошибка
`tsc --noEmit`.

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `backend/apps/students/models.py` | поля `StudentLead.external_id`/`converted_student`, модель `LeadStatusDelivery`, сигналы смены статуса |
| `backend/apps/students/lidpixel.py` (новый) | проверка адреса, сборка тела, отправка, постановка события в журнал |
| `backend/apps/students/tasks.py` (новый) | Celery-задача разноса событий по организациям |
| `backend/apps/tenants/models.py` | `Institution.lidpixel_status_url`/`lidpixel_status_key` |
| `backend/apps/finance/serializers.py` | хук продажи в `PaymentCreateSerializer.create` |
| `backend/apps/institutions/views.py` | три эндпоинта директора |
| `src/lib/api.ts`, `src/routes/director/integrations.tsx` | настройки и журнал в интерфейсе |

---

### Task 1: Поля заявки — внешний номер и связь с учеником

**Files:**
- Modify: `backend/apps/students/models.py` (класс `StudentLead`)
- Modify: `backend/apps/students/views.py` (`public_submit_lead_lidpixel`, `StudentLeadViewSet.convert_to_student`)
- Create: `backend/apps/students/migrations/0009_lead_external_id_converted_student.py`
- Test: `backend/tests/test_lidpixel_status_feedback.py` (новый файл)

- [ ] **Step 1: Написать падающие тесты**

Создать `backend/tests/test_lidpixel_status_feedback.py`:

```python
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
```

Почему разбор проверяется прямым вызовом, а не HTTP-запросом к вебхуку:
вебхук требует существующую `Institution` с `lead_api_key`, а создать её на
SQLite нельзя (см. комментарий в `_institution`). Проверяем ту часть, где
живёт риск — угадывание имени поля.

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `python -m pytest backend/tests/test_lidpixel_status_feedback.py -v`
Expected: FAIL — `ImportError: cannot import name '_lidpixel_external_id'`

- [ ] **Step 3: Добавить поля модели**

В `backend/apps/students/models.py`, в класс `StudentLead`, после поля `source`:

```python
    # Номер заявки на стороне LeadPixel. Нужен, чтобы обратная передача
    # статуса ссылалась на их запись, а не только на нашу.
    external_id = models.CharField(max_length=128, blank=True, default="", db_index=True)
    # Ученик, созданный из заявки. Без этой связи первую оплату не к чему
    # привязать, а значит нечего отправить как продажу.
    converted_student = models.ForeignKey(
        "students.Student",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="source_leads",
    )
```

- [ ] **Step 4: Разбор внешнего номера в вебхуке**

В `backend/apps/students/views.py`, над функцией `public_submit_lead_lidpixel`:

```python
def _lidpixel_external_id(data) -> str:
    """Номер заявки у LeadPixel. Имя поля неизвестно — принимаем алиасы,
    тем же приёмом, что уже применён к имени и телефону."""
    for key in ("id", "lead_id", "leadgen_id"):
        value = data.get(key)
        if value not in (None, ""):
            return str(value)
    return ""
```

В теле `public_submit_lead_lidpixel`, в словарь данных заявки, добавить:

```python
            "external_id": _lidpixel_external_id(data),
```

- [ ] **Step 5: Связь заявки с учеником при переводе**

В `backend/apps/students/views.py`, в `convert_to_student`, заменить:

```python
        # Mark lead as won
        lead.status = "won"
        lead.save(update_fields=["status", "updated_at"])
```

на:

```python
        # Mark lead as won
        lead.status = "won"
        lead.converted_student = student
        lead.save(update_fields=["status", "converted_student", "updated_at"])
```

- [ ] **Step 6: Миграция**

```bash
cd backend && python manage.py makemigrations students --name lead_external_id_converted_student && cd ..
```

Ожидается `backend/apps/students/migrations/0009_lead_external_id_converted_student.py`
с `AddField` на два поля. Если номер получился другой — значит в ветке
появились ещё миграции; это нормально, вручную не переименовывать.

- [ ] **Step 7: Тесты**

Run: `python -m pytest backend/tests/test_lidpixel_status_feedback.py -v`
Expected: PASS (5 passed — 3 параметра алиасов + 2 остальных)

- [ ] **Step 8: Коммит**

```bash
git add backend/apps/students/models.py backend/apps/students/views.py backend/apps/students/migrations/ backend/tests/test_lidpixel_status_feedback.py
git commit -m "feat(leads): store LeadPixel external id and link converted student

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Настройки обратной связи у организации

**Files:**
- Modify: `backend/apps/tenants/models.py` (класс `Institution`)
- Create: `backend/apps/tenants/migrations/0007_institution_lidpixel_status.py`

- [ ] **Step 1: Добавить поля**

В `backend/apps/tenants/models.py`, в класс `Institution`, после `lead_api_key`:

```python
    # Куда и с каким ключом слать статусы заявок обратно в LeadPixel.
    # Хранится открытым текстом — как meta_access_token и sms_password выше:
    # это ключ стороннего сервиса, а не пароль пользователя.
    lidpixel_status_url = models.URLField(max_length=500, blank=True, default="")
    lidpixel_status_key = models.CharField(max_length=255, blank=True, default="")
```

- [ ] **Step 2: Миграция**

```bash
cd backend && python manage.py makemigrations tenants --name institution_lidpixel_status && cd ..
```

- [ ] **Step 3: Проверка**

Run: `cd backend && python manage.py check && cd ..`
Expected: `System check identified no issues`

- [ ] **Step 4: Коммит**

```bash
git add backend/apps/tenants/models.py backend/apps/tenants/migrations/
git commit -m "feat(tenants): add LeadPixel status callback settings to institution

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Журнал отправок

**Files:**
- Modify: `backend/apps/students/models.py`
- Create: `backend/apps/students/migrations/0010_leadstatusdelivery.py`
- Test: `backend/tests/test_lidpixel_status_feedback.py`

- [ ] **Step 1: Написать падающие тесты**

Дописать в тестовый файл:

```python
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
```

- [ ] **Step 2:** Run: `python -m pytest backend/tests/test_lidpixel_status_feedback.py::TestDeliveryModel -v`
Expected: FAIL — `ImportError: cannot import name 'LeadStatusDelivery'`

- [ ] **Step 3: Модель**

В `backend/apps/students/models.py`, после класса `StudentLead`:

```python
class LeadStatusDelivery(models.Model):
    """Журнал отправок статусов заявки во внешний сервис (LeadPixel).

    Событие пишется сразу, в одной транзакции с действием пользователя, а
    отправляется фоном: администратор не должен ждать сеть, и недоступность
    LeadPixel не должна ломать работу в CRM.
    """

    EVENT_CHOICES = [
        ("status_changed", "Status changed"),
        ("sale", "Sale"),
    ]
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("sent", "Sent"),
        ("failed", "Failed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lead = models.ForeignKey(
        StudentLead, on_delete=models.CASCADE, related_name="status_deliveries"
    )
    event = models.CharField(max_length=20, choices=EVENT_CHOICES)
    payload = models.JSONField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="pending")
    attempts = models.PositiveIntegerField(default=0)
    next_attempt_at = models.DateTimeField(default=timezone.now)
    response_code = models.IntegerField(null=True, blank=True)
    last_error = models.TextField(blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "students_lead_status_delivery"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "next_attempt_at"])]
        constraints = [
            # Продажа по заявке одна: вторая означала бы, что первую оплату
            # засчитали дважды.
            models.UniqueConstraint(
                fields=["lead"],
                condition=models.Q(event="sale"),
                name="uniq_sale_delivery_per_lead",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.lead_id} {self.event} {self.status}"
```

Наверху файла убедиться, что есть `import uuid` и
`from django.utils import timezone` — если нет, добавить.

- [ ] **Step 4: Миграция**

```bash
cd backend && python manage.py makemigrations students --name leadstatusdelivery && cd ..
```

- [ ] **Step 5:** Run: `python -m pytest backend/tests/test_lidpixel_status_feedback.py::TestDeliveryModel -v`
Expected: PASS (2 passed)

- [ ] **Step 6: Коммит**

```bash
git add backend/apps/students/models.py backend/apps/students/migrations/ backend/tests/test_lidpixel_status_feedback.py
git commit -m "feat(leads): add LeadStatusDelivery outbox for status callbacks

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Проверка адреса и сборка тела запроса

**Files:**
- Create: `backend/apps/students/lidpixel.py`
- Test: `backend/tests/test_lidpixel_status_feedback.py`

- [ ] **Step 1: Написать падающие тесты**

```python
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

    def test_public_https_url_accepted(self):
        from apps.students.lidpixel import validate_status_url

        assert (
            validate_status_url("https://example.com/status")
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
```

- [ ] **Step 2:** Run: `python -m pytest backend/tests/test_lidpixel_status_feedback.py::TestStatusUrlSafety backend/tests/test_lidpixel_status_feedback.py::TestPayload -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'apps.students.lidpixel'`

- [ ] **Step 3: Реализовать модуль**

Создать `backend/apps/students/lidpixel.py`:

```python
"""Обратная передача статусов заявок в LeadPixel.

Формат запроса LeadPixel публично не описан (см. спеку). Поэтому тело
собирает одна функция — build_lidpixel_payload; когда формат станет
известен, правится только она, а механика доставки не меняется.
"""

import ipaddress
import logging
import socket
from urllib.parse import urlparse

import requests
from django.db import connection
from django.utils import timezone

logger = logging.getLogger(__name__)

# Паузы между попытками, в минутах. Длина списка = предельное число попыток.
RETRY_SCHEDULE_MINUTES = [1, 5, 30, 120, 720]
MAX_ATTEMPTS = len(RETRY_SCHEDULE_MINUTES)
REQUEST_TIMEOUT_SECONDS = 10


class UnsafeStatusUrl(ValueError):
    """Адрес не https или указывает внутрь сети."""


def validate_status_url(url: str) -> str:
    """Адрес задаёт директор, а запрос уходит с нашего сервера.

    Без этой проверки через поле настроек можно было бы заставить наш бэкенд
    постучаться во внутреннюю сеть (метаданные облака, соседние сервисы).
    """
    parsed = urlparse(url or "")
    if parsed.scheme != "https":
        raise UnsafeStatusUrl("Адрес должен начинаться с https://")
    host = parsed.hostname
    if not host:
        raise UnsafeStatusUrl("В адресе не указан хост")
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise UnsafeStatusUrl(f"Не удалось разрешить хост: {host}") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (
            ip.is_loopback
            or ip.is_private
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            raise UnsafeStatusUrl(f"Адрес ведёт во внутреннюю сеть: {ip}")
    return url


def build_lidpixel_payload(*, event, lead, amount=None, currency="UZS", occurred_at=None):
    """Тело запроса. Единственное место, где живёт формат LeadPixel."""
    return {
        "event": event,
        # Пустая строка, а не None: их номер может отсутствовать, но поле
        # должно быть в теле всегда — сопоставить они смогут по crm_lead_id,
        # который мы уже возвращаем им в ответе вебхука приёма.
        "lead_id": lead.external_id or "",
        "crm_lead_id": str(lead.id),
        "status": lead.status,
        "amount": str(amount) if amount is not None else None,
        "currency": currency,
        "occurred_at": (occurred_at or timezone.now()).isoformat(),
    }


def send_status_event(*, url, key, payload):
    """Отправляет событие. Возвращает (успех, код ответа, текст ошибки).

    Адрес проверяется и здесь, а не только при сохранении: между сохранением
    и отправкой DNS-запись могла смениться на внутренний адрес.
    """
    try:
        validate_status_url(url)
    except UnsafeStatusUrl as exc:
        return False, None, str(exc)
    try:
        response = requests.post(
            url,
            json=payload,
            headers={"X-API-Key": key, "Content-Type": "application/json"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        return False, None, str(exc)[:500]
    ok = 200 <= response.status_code < 300
    return ok, response.status_code, "" if ok else response.text[:500]


def _current_institution():
    """Организация текущей схемы.

    Вынесено отдельной функцией, чтобы тесты подменяли её одной строкой:
    настоящую Institution на SQLite не создать — её save() пытается создать
    схему в БД.
    """
    from apps.tenants.models import Institution

    schema = getattr(connection, "schema_name", "")
    return Institution.objects.filter(schema_name=schema).first()


def queue_lead_event(lead, event, amount=None):
    """Кладёт событие в журнал, если его вообще нужно отправлять.

    Возвращает созданную запись или None.
    """
    if lead.source != "lidpixel":
        return None
    institution = _current_institution()
    if not institution or not institution.lidpixel_status_url:
        return None

    from apps.students.models import LeadStatusDelivery

    payload = build_lidpixel_payload(
        event=event,
        lead=lead,
        amount=amount,
        currency=getattr(institution, "currency", "UZS") or "UZS",
    )
    return LeadStatusDelivery.objects.create(lead=lead, event=event, payload=payload)
```

- [ ] **Step 4:** Run те же тесты.
Expected: PASS (9 passed — 7 параметров адреса + 2 тела)

- [ ] **Step 5: Коммит**

```bash
git add backend/apps/students/lidpixel.py backend/tests/test_lidpixel_status_feedback.py
git commit -m "feat(leads): add LeadPixel payload builder and SSRF-safe sender

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: События при смене статуса заявки

**Files:**
- Modify: `backend/apps/students/models.py` (сигналы внизу файла)
- Test: `backend/tests/test_lidpixel_status_feedback.py`

- [ ] **Step 1: Написать падающие тесты**

```python
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
```

Если поля `notes` у `StudentLead` нет — взять любое другое необязательное
текстовое поле модели; смысл теста в сохранении без смены статуса.

- [ ] **Step 2:** Run: `python -m pytest backend/tests/test_lidpixel_status_feedback.py::TestStatusChangeEvents -v`
Expected: FAIL — `LeadStatusDelivery.DoesNotExist` на первом тесте

- [ ] **Step 3: Сигналы**

В конец `backend/apps/students/models.py`, рядом с существующим
`close_memberships_on_status_change` (тот же приём: `pre_save` достаёт
прежнее значение, `post_save` действует):

```python
@receiver(pre_save, sender=StudentLead)
def remember_previous_lead_status(sender, instance, **kwargs):
    """Запоминает прежний статус до записи — post_save его уже не увидит."""
    if kwargs.get("raw") or not instance.pk:
        instance._previous_status = None
        return
    instance._previous_status = (
        StudentLead.objects.filter(pk=instance.pk)
        .values_list("status", flat=True)
        .first()
    )


@receiver(post_save, sender=StudentLead)
def queue_lidpixel_status_event(sender, instance, created, **kwargs):
    """Смена статуса заявки из LeadPixel — повод сообщить ему об этом.

    Создание заявки событием не считается: её прислал сам LeadPixel, и
    начальный статус он знает.
    """
    if kwargs.get("raw") or created:
        return
    previous = getattr(instance, "_previous_status", None)
    if previous is None or previous == instance.status:
        return

    from apps.students.lidpixel import queue_lead_event

    try:
        queue_lead_event(instance, "status_changed")
    except Exception:
        # Заявка важнее уведомления: недоступная настройка или сбой записи
        # журнала не должны отменять сохранение карточки. Ошибку не глушим
        # молча — она уходит в лог целиком.
        logger.exception("Не удалось поставить в очередь статус заявки %s", instance.pk)
```

Наверху файла проверить импорты: `from django.db.models.signals import post_save, pre_save`,
`from django.dispatch import receiver`, и модульный `logger` (если в файле
логгера нет — добавить `import logging` и `logger = logging.getLogger(__name__)`).

- [ ] **Step 4:** Run те же тесты. Expected: PASS (6 passed)

- [ ] **Step 5: Коммит**

```bash
git add backend/apps/students/models.py backend/tests/test_lidpixel_status_feedback.py
git commit -m "feat(leads): queue LeadPixel event on lead status change

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Событие продажи — первая настоящая оплата

**Files:**
- Modify: `backend/apps/finance/serializers.py` (`PaymentCreateSerializer`)
- Test: `backend/tests/test_lidpixel_status_feedback.py`

- [ ] **Step 1: Написать падающие тесты**

```python
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

    def test_student_without_lidpixel_lead_creates_nothing(self):
        from apps.students.models import LeadStatusDelivery

        branch = BranchFactory()
        student = StudentFactory(branch=branch)

        self._pay(student, Decimal("500000.00"))

        assert not LeadStatusDelivery.objects.exists()
```

Подписи `_pay`, `apply_payment` и `reverse_payment` сверить с фактическими:
посмотреть, как их вызывают существующие тесты (`backend/tests/test_bonus_balance.py`,
`backend/tests/test_finance*.py`), и повторить их способ вызова. Смысл
проверок при этом не менять.

- [ ] **Step 2:** Run: `python -m pytest backend/tests/test_lidpixel_status_feedback.py::TestSaleEvent -v`
Expected: FAIL — `LeadStatusDelivery.DoesNotExist` на первом тесте

- [ ] **Step 3: Хук продажи**

В `backend/apps/finance/serializers.py`, над классом `PaymentCreateSerializer`:

```python
def _queue_lidpixel_sale(student, validated_data, payment):
    """Первая настоящая оплата ученика, пришедшего из LeadPixel, — это продажа.

    Хук стоит здесь, а не в сигнале на Payment, сознательно: manual_top_up
    создаётся и сотрудником (настоящие деньги), и сторно ручного списания
    внутри finance/services.py. По самой записи их не различить, но сторно
    через этот сериализатор не проходит никогда — значит здесь остаются
    только деньги клиента. Бонусы отсекает funding_source.
    """
    if validated_data["payment_type"] not in ("top_up", "manual_top_up"):
        return
    if validated_data.get("funding_source", "main") != "main":
        return

    from apps.students.lidpixel import queue_lead_event
    from apps.students.models import LeadStatusDelivery, StudentLead

    lead = StudentLead.objects.filter(
        converted_student=student, source="lidpixel"
    ).first()
    if not lead:
        return
    if LeadStatusDelivery.objects.filter(lead=lead, event="sale").exists():
        return
    queue_lead_event(lead, "sale", amount=payment.amount)
```

В `PaymentCreateSerializer.create`, перед `return payment_result.payment`,
добавить строку (аргументы `apply_payment` не трогать):

```python
        _queue_lidpixel_sale(student, validated_data, payment_result.payment)
```

- [ ] **Step 4:** Run те же тесты. Expected: PASS (6 passed)

- [ ] **Step 5: Коммит**

```bash
git add backend/apps/finance/serializers.py backend/tests/test_lidpixel_status_feedback.py
git commit -m "feat(finance): report first real payment to LeadPixel as a sale

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Фоновая доставка с повторами

**Files:**
- Create: `backend/apps/students/tasks.py`
- Modify: `backend/config/settings/base.py` (`CELERY_BEAT_SCHEDULE`)
- Test: `backend/tests/test_lidpixel_status_feedback.py`

- [ ] **Step 1: Написать падающие тесты**

```python
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
```

- [ ] **Step 2:** Run: `python -m pytest backend/tests/test_lidpixel_status_feedback.py::TestDelivery -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'apps.students.tasks'`

- [ ] **Step 3: Реализовать задачу**

Создать `backend/apps/students/tasks.py`:

```python
"""Фоновая доставка статусов заявок в LeadPixel."""

import logging
from datetime import timedelta

from celery import shared_task
from django.core.cache import cache
from django.utils import timezone
from django_tenants.utils import get_public_schema_name, get_tenant_model, schema_context

from apps.students.lidpixel import MAX_ATTEMPTS, RETRY_SCHEDULE_MINUTES, send_status_event

logger = logging.getLogger(__name__)

BATCH_SIZE = 50


def deliver_pending_for_institution(institution):
    """Разносит готовые к отправке события одной организации.

    Вынесено из задачи отдельной функцией: обход тенантов на SQLite не
    работает, и без этого разделения логика повторов осталась бы без тестов.
    """
    from apps.students.models import LeadStatusDelivery

    url = getattr(institution, "lidpixel_status_url", "")
    key = getattr(institution, "lidpixel_status_key", "")
    if not url:
        return 0

    due = LeadStatusDelivery.objects.filter(
        status="pending", next_attempt_at__lte=timezone.now()
    ).order_by("created_at")[:BATCH_SIZE]

    sent = 0
    for delivery in due:
        ok, code, error = send_status_event(url=url, key=key, payload=delivery.payload)
        delivery.attempts += 1
        delivery.response_code = code
        if ok:
            delivery.status = "sent"
            delivery.last_error = ""
            delivery.sent_at = timezone.now()
            sent += 1
        else:
            delivery.last_error = error or ""
            if delivery.attempts >= MAX_ATTEMPTS:
                delivery.status = "failed"
            else:
                minutes = RETRY_SCHEDULE_MINUTES[delivery.attempts - 1]
                delivery.next_attempt_at = timezone.now() + timedelta(minutes=minutes)
        delivery.save(
            update_fields=[
                "attempts",
                "response_code",
                "status",
                "last_error",
                "sent_at",
                "next_attempt_at",
            ]
        )
    return sent


@shared_task
def deliver_lead_statuses():
    """Обходит организации и отправляет накопившиеся события."""
    tenant_model = get_tenant_model()
    public = get_public_schema_name()
    for institution in tenant_model.objects.exclude(schema_name=public).iterator():
        if not getattr(institution, "lidpixel_status_url", ""):
            continue
        # Замок на схему: beat запускает задачу раз в минуту, а проход может
        # занять дольше — без замка два прогона отправили бы одни и те же
        # события дважды. Тот же приём, что у ежедневных списаний.
        lock_key = f"deliver_lead_statuses:{institution.schema_name}"
        if not cache.add(lock_key, "running", timeout=300):
            logger.warning(
                "deliver_lead_statuses уже выполняется для %s — пропускаем",
                institution.schema_name,
            )
            continue
        try:
            with schema_context(institution.schema_name):
                sent = deliver_pending_for_institution(institution)
            if sent:
                logger.info(
                    "deliver_lead_statuses: отправлено %s событий для %s",
                    sent,
                    institution.schema_name,
                )
        finally:
            cache.delete(lock_key)
```

- [ ] **Step 4: Расписание**

В `backend/config/settings/base.py`, в `CELERY_BEAT_SCHEDULE`, добавить:

```python
    "deliver-lead-statuses": {
        "task": "apps.students.tasks.deliver_lead_statuses",
        "schedule": crontab(minute="*"),
    },
```

Проверить, что `apps.students.tasks` попадает в автообнаружение Celery тем
же способом, что и `apps.finance.tasks` (в этом проекте — `autodiscover_tasks`
по приложениям; отдельная регистрация не нужна).

- [ ] **Step 5:** Run те же тесты. Expected: PASS (5 passed)

- [ ] **Step 6: Коммит**

```bash
git add backend/apps/students/tasks.py backend/config/settings/base.py backend/tests/test_lidpixel_status_feedback.py
git commit -m "feat(leads): deliver LeadPixel status events in background with retries

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Эндпоинты настроек, проверки и журнала

**Files:**
- Modify: `backend/apps/institutions/views.py` (`BranchViewSet`)
- Modify: `src/lib/api.ts` (`branchApi`)
- Test: `backend/tests/test_lidpixel_status_feedback.py`

- [ ] **Step 1: Написать падающие тесты**

```python
class TestSettingsEndpoints:
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
```

Успешное сохранение тестом не покрываем: `request.tenant` — настоящая
`Institution`, а её на SQLite нет. Поэтому проверяем отказы, которые
срабатывают до обращения к `request.tenant`, — и порядок проверок в коде
должен быть именно такой: сначала права, потом валидация адреса, потом
сохранение. Фикстура `api_client` — существующая в `backend/tests/conftest.py`;
если её имя другое, взять фактическое из соседних тестов.

- [ ] **Step 2:** Run: `python -m pytest backend/tests/test_lidpixel_status_feedback.py::TestSettingsEndpoints -v`
Expected: FAIL — 404 (эндпоинта нет)

- [ ] **Step 3: Эндпоинты**

В `backend/apps/institutions/views.py`, в `BranchViewSet`, после `lead_api_key`:

```python
    @action(
        detail=False,
        methods=["get", "patch"],
        url_path="lidpixel-status-settings",
        permission_classes=[IsDirector],
    )
    def lidpixel_status_settings(self, request):
        from apps.students.lidpixel import UnsafeStatusUrl, validate_status_url

        # Адрес проверяем до обращения к организации: невалидный ввод не
        # должен зависеть от состояния тенанта.
        if request.method == "PATCH" and "lidpixel_status_url" in request.data:
            url = (request.data.get("lidpixel_status_url") or "").strip()
            if url:
                try:
                    validate_status_url(url)
                except UnsafeStatusUrl as exc:
                    return Response(
                        {"lidpixel_status_url": str(exc)},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        institution = request.tenant
        if request.method == "GET":
            return Response(
                {
                    "lidpixel_status_url": institution.lidpixel_status_url,
                    "lidpixel_status_key_masked": (
                        f"****{institution.lidpixel_status_key[-4:]}"
                        if institution.lidpixel_status_key
                        else ""
                    ),
                    "has_key": bool(institution.lidpixel_status_key),
                },
                status=status.HTTP_200_OK,
            )

        if "lidpixel_status_url" in request.data:
            institution.lidpixel_status_url = (
                request.data.get("lidpixel_status_url") or ""
            ).strip()
        key = request.data.get("lidpixel_status_key")
        # Маску обратно не сохраняем: её присылает форма, если ключ не меняли.
        if key and not key.startswith("****"):
            institution.lidpixel_status_key = key
        institution.save(update_fields=["lidpixel_status_url", "lidpixel_status_key"])
        return Response({"detail": "Saved"}, status=status.HTTP_200_OK)

    @action(
        detail=False,
        methods=["post"],
        url_path="lidpixel-status-test",
        permission_classes=[IsDirector],
    )
    def lidpixel_status_test(self, request):
        """Проверочное событие — отправляется сразу, в журнал не пишется."""
        from django.utils import timezone

        from apps.students.lidpixel import send_status_event

        institution = request.tenant
        if not institution.lidpixel_status_url:
            return Response(
                {"detail": "Адрес для статусов не задан"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ok, code, error = send_status_event(
            url=institution.lidpixel_status_url,
            key=institution.lidpixel_status_key,
            payload={
                "event": "test",
                "lead_id": "",
                "crm_lead_id": "",
                "status": "test",
                "amount": None,
                "currency": institution.currency or "UZS",
                "occurred_at": timezone.now().isoformat(),
            },
        )
        return Response(
            {"ok": ok, "response_code": code, "error": error},
            status=status.HTTP_200_OK,
        )

    @action(
        detail=False,
        methods=["get"],
        url_path="lidpixel-deliveries",
        permission_classes=[IsDirector],
    )
    def lidpixel_deliveries(self, request):
        from apps.students.models import LeadStatusDelivery

        deliveries = LeadStatusDelivery.objects.select_related("lead").order_by(
            "-created_at"
        )[:20]
        return Response(
            {
                "results": [
                    {
                        "id": str(d.id),
                        "lead_name": d.lead.full_name,
                        "event": d.event,
                        "status": d.status,
                        "attempts": d.attempts,
                        "response_code": d.response_code,
                        "last_error": d.last_error,
                        "created_at": d.created_at.isoformat(),
                    }
                    for d in deliveries
                ]
            },
            status=status.HTTP_200_OK,
        )
```

- [ ] **Step 4: Обёртки на фронте**

В `src/lib/api.ts`, в объект `branchApi`, рядом с `leadApiKey`:

```typescript
  lidpixelStatusSettings: () =>
    requestJson<{
      lidpixel_status_url: string;
      lidpixel_status_key_masked: string;
      has_key: boolean;
    }>("/branches/lidpixel-status-settings/"),
  updateLidpixelStatusSettings: (data: Record<string, unknown>) =>
    requestJson("/branches/lidpixel-status-settings/", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  testLidpixelStatus: () =>
    requestJson<{ ok: boolean; response_code: number | null; error: string }>(
      "/branches/lidpixel-status-test/",
      { method: "POST" },
    ),
  lidpixelDeliveries: () =>
    requestJson<{
      results: Array<{
        id: string;
        lead_name: string;
        event: string;
        status: string;
        attempts: number;
        response_code: number | null;
        last_error: string;
        created_at: string;
      }>;
    }>("/branches/lidpixel-deliveries/"),
```

Имя низкоуровневого хелпера (`requestJson` или иное) и форму вызова взять у
соседних методов `metaSettings`/`updateSmsSettings`/`leadApiKey` в этом же
файле — не изобретать новый.

- [ ] **Step 5:** Проверки

```bash
python -m pytest backend/tests/test_lidpixel_status_feedback.py::TestSettingsEndpoints -v
npm run build
```
Expected: тесты PASS (2 passed), сборка чистая

- [ ] **Step 6: Коммит**

```bash
git add backend/apps/institutions/views.py src/lib/api.ts backend/tests/test_lidpixel_status_feedback.py
git commit -m "feat(integrations): expose LeadPixel status settings, test and log endpoints

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Блок в «Интеграциях» у директора

**Files:**
- Modify: `src/routes/director/integrations.tsx`

Подписи в этом файле написаны инлайн (`lang === "uz" ? … : …`), а не через
словарь — новый блок пишется так же, чтобы не смешивать два подхода в одном
файле. Ключи `lidpixelStatus.*` в `src/lib/i18n.tsx` НЕ заводятся.

- [ ] **Step 1: Состояние и обработчики**

Рядом с существующими `useState` (около строки 38) добавить:

```tsx
  const [statusUrl, setStatusUrl] = useState("");
  const [statusKey, setStatusKey] = useState("");
  const [statusKeyMasked, setStatusKeyMasked] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusTesting, setStatusTesting] = useState(false);
  const [deliveries, setDeliveries] = useState<
    Array<{
      id: string;
      lead_name: string;
      event: string;
      status: string;
      response_code: number | null;
      last_error: string;
      created_at: string;
    }>
  >([]);
```

После существующего `useEffect`, который грузит `branchApi.leadApiKey()`:

```tsx
  useEffect(() => {
    branchApi
      .lidpixelStatusSettings()
      .then((data) => {
        setStatusUrl(data.lidpixel_status_url);
        setStatusKeyMasked(data.lidpixel_status_key_masked);
      })
      .catch((err) => {
        console.error("Failed to load LidPixel status settings", err);
        toast.error(apiErrorMessage(err));
      });
    branchApi
      .lidpixelDeliveries()
      .then((data) => setDeliveries(data.results))
      .catch((err) => console.error("Failed to load LidPixel deliveries", err));
  }, []);

  const saveStatusSettings = async () => {
    if (statusSaving) return;
    setStatusSaving(true);
    try {
      const payload: Record<string, unknown> = { lidpixel_status_url: statusUrl };
      if (statusKey) payload.lidpixel_status_key = statusKey;
      await branchApi.updateLidpixelStatusSettings(payload);
      if (statusKey) {
        setStatusKeyMasked(`****${statusKey.slice(-4)}`);
        setStatusKey("");
      }
      toast.success(lang === "uz" ? "Saqlandi" : "Сохранено");
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setStatusSaving(false);
    }
  };

  const sendTestStatus = async () => {
    if (statusTesting) return;
    setStatusTesting(true);
    try {
      const res = await branchApi.testLidpixelStatus();
      if (res.ok) {
        toast.success(
          lang === "uz"
            ? `LeadPixel javob berdi: ${res.response_code}`
            : `LeadPixel ответил: ${res.response_code}`,
        );
      } else {
        toast.error(res.error || (lang === "uz" ? "Yuborilmadi" : "Не отправлено"));
      }
      const data = await branchApi.lidpixelDeliveries();
      setDeliveries(data.results);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setStatusTesting(false);
    }
  };
```

- [ ] **Step 2: Разметка блока**

В карточке LidPixel, после кнопки перевыпуска ключа и до закрывающего тега
блока `space-y-3` (около строки 405), добавить:

```tsx
                <div className="border-t border-border pt-3 mt-3 space-y-3">
                  <div>
                    <h4 className="text-sm font-medium">
                      {lang === "uz"
                        ? "Statuslarni qaytarish"
                        : "Обратная передача статусов"}
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {lang === "uz"
                        ? "CRM o'zi LeadPixel'ga ariza statusi va birinchi to'lov haqida xabar beradi — shunda u sotuvlar va reklama qaytimini hisoblaydi."
                        : "CRM сама сообщает LeadPixel о смене статуса заявки и первой оплате — тогда он считает продажи и окупаемость рекламы."}
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">
                      {lang === "uz" ? "Statuslar uchun manzil" : "Адрес для статусов"}
                    </Label>
                    <Input
                      value={statusUrl}
                      onChange={(e) => setStatusUrl(e.target.value)}
                      placeholder="https://..."
                      className="mt-1 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">
                      {lang === "uz" ? "LeadPixel kaliti" : "Ключ LeadPixel"}
                    </Label>
                    <Input
                      value={statusKey}
                      onChange={(e) => setStatusKey(e.target.value)}
                      placeholder={statusKeyMasked || "—"}
                      className="mt-1 text-xs font-mono"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={saveStatusSettings}
                      disabled={statusSaving}
                    >
                      {statusSaving ? "..." : lang === "uz" ? "Saqlash" : "Сохранить"}
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={sendTestStatus}
                      disabled={statusTesting || !statusUrl}
                    >
                      {statusTesting ? "..." : lang === "uz" ? "Tekshirish" : "Проверить"}
                    </Button>
                  </div>

                  {deliveries.length > 0 && (
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        {lang === "uz" ? "So'nggi yuborishlar" : "Последние отправки"}
                      </Label>
                      <div className="mt-1 space-y-1">
                        {deliveries.map((d) => (
                          <div
                            key={d.id}
                            className="flex items-center justify-between gap-2 text-[11px]"
                          >
                            <span className="truncate text-muted-foreground">
                              {d.lead_name} ·{" "}
                              {d.event === "sale"
                                ? lang === "uz"
                                  ? "sotuv"
                                  : "продажа"
                                : lang === "uz"
                                  ? "status"
                                  : "статус"}
                            </span>
                            <span
                              className={
                                d.status === "sent"
                                  ? "shrink-0 text-ok"
                                  : d.status === "failed"
                                    ? "shrink-0 text-bad"
                                    : "shrink-0 text-muted-foreground"
                              }
                            >
                              {d.status === "sent"
                                ? lang === "uz"
                                  ? "yuborildi"
                                  : "отправлено"
                                : d.status === "failed"
                                  ? lang === "uz"
                                    ? "xato"
                                    : "ошибка"
                                  : lang === "uz"
                                    ? "navbatda"
                                    : "в очереди"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
```

Классы `text-ok`/`text-bad` — семантические токены проекта; если в этом
файле статусы уже красят другим способом, повторить местный способ.

- [ ] **Step 3: Сборка и типы**

```bash
npm run build
./node_modules/.bin/tsc --noEmit 2>&1 | grep -c "error TS"
```
Expected: сборка чистая; число ошибок типов — 21 (базовый уровень, без новых)

- [ ] **Step 4: Коммит**

```bash
git add src/routes/director/integrations.tsx
git commit -m "feat(integrations): add LeadPixel status callback settings to director UI

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Полная проверка, документация, мерж и деплой

- [ ] **Step 1: Весь набор проверок**

```bash
python -m pytest backend/tests/test_lidpixel_status_feedback.py -v
cd backend && python manage.py check && python manage.py makemigrations --check --dry-run && cd ..
python -m pytest backend/tests -q
npm run build
./node_modules/.bin/tsc --noEmit 2>&1 | grep -c "error TS"
npx playwright test
```

Expected: новые тесты зелёные; `makemigrations --check` — «No changes
detected» (все миграции созданы в задачах 1–3); полный прогон — 24 падения в
чужих файлах (базовый уровень), без новых; сборка чистая; `tsc` — 21;
Playwright — всё зелёное.

- [ ] **Step 2: Целостный ревью диапазона**

Перечитать `git diff master...feature/lidpixel-status-feedback` целиком.
Особое внимание:
- продажа не может уйти дважды по одной заявке (ограничение в БД + проверка
  в коде) и не уходит со сторно и с бонуса;
- события не создаются, когда адрес не настроен — интеграция выключена по
  умолчанию, и приём заявок работает как раньше;
- ключ LeadPixel не возвращается в открытом виде ни одним эндпоинтом;
- проверка адреса вызывается и при сохранении, и перед каждой отправкой;
- сбой постановки события не отменяет сохранение заявки, но и не глушится
  молча (`logger.exception`).

- [ ] **Step 3: Сверить миграции с продом до деплоя**

```bash
cd backend && python manage.py showmigrations students tenants | tail -20 && cd ..
```
Сверить с применёнными на проде (в этом репозитории уже был конфликт номеров
после отката роли «Бухгалтер»). Если на проде есть миграции `students`/`tenants`
с теми же номерами, но другими именами — остановиться и разобраться, не
переименовывать вслепую.

- [ ] **Step 4: Обновить `CLAUDE.md`**

Добавить раздел по образцу соседних: что построено, почему продажа ловится в
сериализаторе, что блокирует включение (миграция на стороне LeadPixel), и что
формат тела правится в одной функции `build_lidpixel_payload`.

- [ ] **Step 5: Коммит документации**

```bash
git add CLAUDE.md
git commit -m "docs: record LeadPixel status feedback feature

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Мерж и деплой**

```bash
git checkout master
git merge --ff-only feature/lidpixel-status-feedback
git push origin master
git checkout staging && git merge --ff-only master && git push origin staging && git checkout master
```

Если fast-forward невозможен — остановиться, не форсировать.

- [ ] **Step 7: Проверить прод**

Через Railway MCP: оба сервиса (`educrm` = `3d6efe67-39fd-42de-8d6b-4f40e8e78420`,
`rare-elegance` = `cd22127f-1799-4f5e-984c-f071933a7f3d`, проект
`c257906f-dccd-441c-98a0-8b31d4078176`, окружение
`55b51b42-34f6-4a0f-b641-c99f1e23372d`) должны дойти до `SUCCESS`, в логах
бэкенда — применение двух новых миграций на всех схемах и health-check `200`.

---

## Не входит

- Починка подключения на стороне LeadPixel (их миграция).
- Отзыв продажи при сторно первой оплаты.
- Подключение других сервисов аналитики.
