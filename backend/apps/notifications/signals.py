import logging
import time
import threading
from concurrent.futures import ThreadPoolExecutor

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from .models import Notification
from .whatsapp import send_whatsapp_message

logger = logging.getLogger(__name__)

_executor = None
_executor_lock = threading.Lock()


def _get_executor():
    global _executor
    if _executor is None:
        with _executor_lock:
            if _executor is None:
                _executor = ThreadPoolExecutor(max_workers=10)
    return _executor


@receiver(post_save, sender=Notification)
def dispatch_whatsapp_on_create(sender, instance, created, **kwargs):
    """
    Fires on every new Notification row (status=pending).
    Dispatches the WhatsApp call in a background thread.
    Uses queryset.update() to avoid re-triggering this signal on status update.
    """
    if not created:
        return
    if instance.status != 'pending':
        return
    if not instance.recipient_phone:
        logger.warning(f"Notification {instance.pk} skipped — no phone number.")
        Notification.objects.filter(pk=instance.pk).update(
            status='failed',
            error_log='No recipient phone number provided.',
        )
        return

    pk      = instance.pk
    phone   = instance.recipient_phone
    message = instance.message

    logger.info("Notification %s dispatching to %s | trigger=%s",
                pk, phone, getattr(instance, 'trigger_type', None))

    def _send():
        from django.db import connection
        connection.close()
        time.sleep(0.1)
        try:
            result = send_whatsapp_message(to=phone, message=message)
            if result['success']:
                Notification.objects.filter(pk=pk).update(
                    status='sent',
                    sent_at=timezone.now(),
                )
                logger.info(f"Notification {pk} sent to {phone}")
            else:
                Notification.objects.filter(pk=pk).update(
                    status='failed',
                    error_log=result.get('error', 'Unknown error'),
                )
                logger.error(f"Notification {pk} failed: {result.get('error')}")
        except Exception as e:
            logger.exception(f"Notification {pk} thread crashed: {e}")

    _get_executor().submit(_send)
