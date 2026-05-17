import hashlib
import logging
import time

import requests

logger = logging.getLogger(__name__)


def sha256(value: str) -> str:
    return hashlib.sha256(value.strip().lower().encode()).hexdigest()


def send_lead_event(
    pixel_id: str,
    access_token: str,
    phone: str,
    lead_id: str,
    event_name: str = "Lead",
) -> bool:
    """
    Отправить событие Lead в Meta Conversions API.
    Возвращает True если успешно, False при ошибке.
    """
    if not pixel_id or not access_token:
        logger.warning("Meta Pixel ID or Access Token not configured")
        return False

    url = f"https://graph.facebook.com/v18.0/{pixel_id}/events"

    phone_clean = phone.replace("+", "").replace(" ", "").replace("-", "")

    payload = {
        "data": [
            {
                "event_name": event_name,
                "event_time": int(time.time()),
                "action_source": "system_generated",
                "user_data": {
                    "ph": [sha256(phone_clean)],
                    "lead_id": lead_id,
                },
                "custom_data": {
                    "event_source": "crm",
                    "lead_event_source": "EduCRM",
                },
            }
        ],
        "access_token": access_token,
    }

    try:
        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()
        logger.info(f"Meta Lead event sent: lead_id={lead_id}")
        return True
    except requests.RequestException as e:
        logger.error(f"Meta Lead event failed: {e}")
        return False
