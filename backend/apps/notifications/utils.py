import re
import logging

logger = logging.getLogger(__name__)

TEMPLATES = {
    "job_checkin":      (
        "Hi {name}, your vehicle {vehicle_number} has been checked in at {business_name}. "
        "Job Card #{job_card_number}. We'll notify you when it's ready!"
    ),
    "job_completed":    (
        "Hi {name}, great news! Your vehicle {vehicle_number} is ready for pickup. "
        "Job Card #{job_card_number} — Total: ₹{total_amount}. "
        "Thank you for choosing {business_name}!"
    ),
    "payment_received": (
        "Hi {name}, payment of ₹{amount} received for Job Card #{job_card_number} "
        "({vehicle_number}). Balance remaining: ₹{balance}. Thank you!"
    ),
    "customer_welcome": (
        "Hi {name}, welcome to {business_name}! "
        "We're glad to have you as our valued customer."
    ),
    "garage_payment":   (
        "Hi {garage_name}, a payment of ₹{amount} has been applied to your outstanding "
        "job cards at {business_name}. Thank you!"
    ),
    "service_reminder": (
        "Hi {name}, your vehicle {vehicle_number} is due for a service at {business_name}. "
        "Book your appointment today!"
    ),
    "garage_all_completed": (
        "Hi {garage_name}, all {count} of your job card(s) at {business_name} are now complete. "
        "Please arrange collection of your vehicles at your earliest convenience."
    ),
    "low_stock_alert": (
        "Low Stock Alert — {business_name}: {product_name} ({brand}) is running low. "
        "Current stock: {quantity} {unit}. Please reorder soon."
    ),
    "salary_processed": (
        "Hi {name}, your salary of ₹{amount} for {month} has been processed at {business_name}. "
        "Thank you for your hard work!"
    ),
}

_TRIGGER_SETTING_KEY = {
    "job_checkin":             "NOTIFY_CHECKIN",
    "job_completed":           "NOTIFY_COMPLETED",
    "payment_received":        "NOTIFY_PAYMENT",
    "customer_welcome":        "NOTIFY_CUSTOMER_WELCOME",
    "garage_payment":          "NOTIFY_GARAGE_PAYMENT",
    "service_reminder":        "NOTIFY_SERVICE_REMINDER",
    "garage_all_completed":    "NOTIFY_GARAGE_ALL_COMPLETED",
    "low_stock_alert":         "NOTIFY_LOW_STOCK",
    "salary_processed":        "NOTIFY_SALARY",
}


def is_notify_enabled(key: str) -> bool:
    from apps.site_settings.models import Setting
    try:
        val = Setting.objects.get(field_name=key).value
        return val.lower() in ('1', 'true', 'yes', 'on')
    except Setting.DoesNotExist:
        return False


def _norm_phone(phone) -> str:
    digits = re.sub(r'\D', '', str(phone or ''))
    if not digits:
        return ''
    # Strip leading 91 if already present (e.g. GarageOwner stores unnormalized numbers),
    # then always re-add it so the result is always 91XXXXXXXXXX.
    if len(digits) > 10 and digits.startswith('91'):
        digits = digits[2:]
    return f'91{digits}'


def _get_business_name() -> str:
    from apps.site_settings.models import Setting
    try:
        return Setting.objects.get(field_name='business_name').value or 'Detailing Workshop'
    except Setting.DoesNotExist:
        return 'Detailing Workshop'


def _get_admin_phone() -> str:
    from apps.site_settings.models import Setting
    try:
        return Setting.objects.get(field_name='admin_whatsapp_number').value or ''
    except Setting.DoesNotExist:
        return ''


def queue_notification(recipient_name: str, phone: str, trigger_type: str, **template_vars) -> None:
    """
    Build message from template, check the toggle setting, then insert a
    Notification row with status='pending'. The post_save signal in signals.py
    dispatches the actual WhatsApp message asynchronously.
    """
    from .models import Notification

    setting_key = _TRIGGER_SETTING_KEY.get(trigger_type)
    if setting_key and not is_notify_enabled(setting_key):
        return

    phone = _norm_phone(phone)
    if not phone:
        logger.warning(f"queue_notification: no phone for {recipient_name} ({trigger_type}), skipping.")
        return

    template = TEMPLATES.get(trigger_type, "Hi {name}.")
    try:
        message = template.format(name=recipient_name, **template_vars)
    except KeyError as e:
        logger.error(f"queue_notification: missing template variable {e} for {trigger_type}")
        return

    Notification.objects.create(
        recipient_name=recipient_name,
        recipient_phone=phone,
        channel='whatsapp',
        trigger_type=trigger_type,
        message=message,
        status='pending',
    )
