import logging
from datetime import timedelta

from django.utils import timezone

logger = logging.getLogger(__name__)


def notify_service_due(days_ahead: int = 7):
    """
    Find vehicles whose next_service_date falls exactly `days_ahead` days from today
    and send a service due reminder to the customer.
    Deduplication: skip if already sent today for the same vehicle number.
    """
    from apps.customers.models import CustomerAsset
    from apps.notifications.models import Notification
    from apps.notifications.utils import queue_notification, _get_business_name, is_notify_enabled

    if not is_notify_enabled('NOTIFY_SERVICE_REMINDER'):
        return

    today       = timezone.now().date()
    target      = today + timedelta(days=days_ahead)
    today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    biz         = _get_business_name()

    due_assets = CustomerAsset.objects.filter(
        next_service_date=target,
    ).select_related('customer')

    for asset in due_assets:
        already = Notification.objects.filter(
            trigger_type='service_reminder',
            created_at__gte=today_start,
            message__contains=asset.vehicle_number,
        ).exists()
        if already:
            continue

        try:
            cust = asset.customer
            queue_notification(
                recipient_name=cust.customer_name,
                phone=cust.phone_number,
                trigger_type='service_reminder',
                vehicle_number=asset.vehicle_number,
                business_name=biz,
            )
        except Exception:
            logger.exception("service_reminder failed for vehicle %s", asset.vehicle_number)
