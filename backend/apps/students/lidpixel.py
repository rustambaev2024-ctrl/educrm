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
            # Без этого проверку адреса можно обойти целиком: разрешённый
            # публичный хост отвечает 302 на внутренний адрес, и requests
            # молча идёт туда уже без всяких проверок.
            allow_redirects=False,
        )
    except requests.RequestException as exc:
        return False, None, str(exc)[:500]
    if 300 <= response.status_code < 400:
        return False, response.status_code, "Переадресация запрещена"
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
