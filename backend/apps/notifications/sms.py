import logging

import requests
from django.core.cache import cache

logger = logging.getLogger(__name__)

ESKIZ_BASE_URL = "https://notify.eskiz.uz/api"


class EskizSmsService:
    @staticmethod
    def _get_token(email: str, password: str, schema: str) -> str | None:
        cache_key = f"eskiz_token:{schema}"
        token = cache.get(cache_key)
        if token:
            return token
        try:
            resp = requests.post(
                f"{ESKIZ_BASE_URL}/auth/login",
                data={"email": email, "password": password},
                timeout=10,
            )
            resp.raise_for_status()
            token = resp.json()["data"]["token"]
            cache.set(cache_key, token, 86400)  # 24 часа
            return token
        except Exception as e:
            logger.error(f"Eskiz auth failed for {schema}: {e}")
            return None

    @classmethod
    def send(
        cls,
        phone: str,
        message: str,
        email: str,
        password: str,
        sender: str,
        schema: str,
    ) -> bool:
        # Нормализация телефона (убрать +, пробелы)
        phone = phone.replace("+", "").replace(" ", "").strip()
        if not phone.startswith("998"):
            phone = "998" + phone.lstrip("0")

        token = cls._get_token(email, password, schema)
        if not token:
            return False

        try:
            resp = requests.post(
                f"{ESKIZ_BASE_URL}/message/sms/send",
                headers={"Authorization": f"Bearer {token}"},
                data={
                    "mobile_phone": phone,
                    "message": message,
                    "from": sender or "4546",
                    "callback_url": "",
                },
                timeout=10,
            )
            resp.raise_for_status()
            logger.info(f"SMS sent to {phone}: {resp.json()}")
            return True
        except Exception as e:
            logger.error(f"SMS send failed to {phone}: {e}")
            # Если 401 — сброс кэша токена
            if "401" in str(e):
                cache.delete(f"eskiz_token:{schema}")
            return False

    @classmethod
    def send_for_tenant(cls, institution, phone: str, message: str, schema: str) -> bool:
        if not institution.sms_enabled:
            return False
        if not institution.sms_email or not institution.sms_password:
            return False
        return cls.send(
            phone=phone,
            message=message,
            email=institution.sms_email,
            password=institution.sms_password,
            sender=institution.sms_sender,
            schema=schema,
        )
