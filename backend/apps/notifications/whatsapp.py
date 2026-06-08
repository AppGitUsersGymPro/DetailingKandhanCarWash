import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)


def send_whatsapp_message(to: str, message: str) -> dict:
    """
    Send a WhatsApp text message via Meta Cloud API.
    `to` must include country code with no + or spaces, e.g. "919876543210"
    """
    access_token    = getattr(settings, 'META_WHATSAPP_ACCESS_TOKEN', '')
    phone_number_id = getattr(settings, 'META_WHATSAPP_PHONE_NUMBER_ID', '')

    if not access_token or not phone_number_id:
        logger.error("META_WHATSAPP_ACCESS_TOKEN or META_WHATSAPP_PHONE_NUMBER_ID not set in settings.")
        return {"success": False, "error": "Missing WhatsApp credentials in environment."}

    url = f"https://graph.facebook.com/v18.0/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type":  "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to":   to,
        "type": "text",
        "text": {"body": message},
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        response.raise_for_status()
        logger.info(f"WhatsApp sent to {to}: {response.status_code}")
        return {"success": True, "data": response.json()}
    except requests.exceptions.HTTPError as e:
        logger.error(f"WhatsApp HTTP error to {to}: {e.response.text}")
        return {"success": False, "error": e.response.text}
    except requests.exceptions.RequestException as e:
        logger.error(f"WhatsApp request failed to {to}: {e}")
        return {"success": False, "error": str(e)}
