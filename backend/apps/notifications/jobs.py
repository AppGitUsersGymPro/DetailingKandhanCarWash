import logging
from datetime import timedelta, datetime

from django.utils import timezone

logger = logging.getLogger(__name__)


def notify_service_due(days_ahead: int = 2, trigger_type: str = 'service_reminder', setting_key: str = 'NOTIFY_SERVICE_REMINDER'):
    """
    Find vehicles whose next_service_date falls exactly `days_ahead` days from today
    and queue a WhatsApp notification to the customer.
    Deduplication: skip if a notification with this trigger_type was already sent today for the same vehicle.
    """
    from apps.customers.models import CustomerAsset
    from apps.notifications.models import Notification
    from apps.notifications.utils import queue_notification, _get_business_name, is_notify_enabled

    if not is_notify_enabled(setting_key):
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
            trigger_type=trigger_type,
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
                trigger_type=trigger_type,
                vehicle_number=asset.vehicle_number,
                business_name=biz,
            )
        except Exception:
            logger.exception("%s failed for vehicle %s", trigger_type, asset.vehicle_number)


def notify_service_due_today():
    """Vehicles whose service is due today — separate toggle from the 2-day advance reminder."""
    notify_service_due(days_ahead=0, trigger_type='service_due_today', setting_key='NOTIFY_SERVICE_TODAY')


def run_auto_absent():
    """
    For every active employee whose shift started more than `threshold` hours ago
    and who has no attendance record for today, create an auto_absent record and
    send WhatsApp notifications to the employee and to the admin number.
    Designed to be called by the `run_auto_absent` management command every hour.
    """
    from apps.employees.models import Employee, Attendance
    from apps.notifications.utils import (
        queue_notification, _get_business_name,
        _get_admin_phone, _get_absent_threshold_hours, is_notify_enabled,
    )


    now       = timezone.localtime()
    today     = now.date()
    threshold = _get_absent_threshold_hours()
    biz       = _get_business_name()
    admin_ph  = _get_admin_phone()
    date_str  = today.strftime('%d %b %Y')

    employees = (
        Employee.objects
        .filter(status='active', shift__isnull=False)
        .select_related('shift')
    )

    for emp in employees:
        shift = emp.shift

        # Skip if today is not a working day for this shift
        if not shift.is_working_day(today):
            continue

        # Deadline = shift start + threshold hours (timezone-aware)
        from zoneinfo import ZoneInfo
        from django.conf import settings as django_settings
        tz = ZoneInfo(getattr(django_settings, 'TIME_ZONE', 'UTC'))
        shift_start_dt = datetime.combine(today, shift.start_time, tzinfo=tz)
        deadline = shift_start_dt + timedelta(hours=threshold)

        if now < deadline:
            continue  # threshold not yet passed

        # Skip if attendance already exists for today
        if Attendance.objects.filter(employee=emp, date=today).exists():
            continue

        # Create auto_absent record
        try:
            Attendance.objects.create(
                employee=emp,
                date=today,
                status='auto_absent',
                notes=f'Auto-marked absent: no check-in {threshold}h after shift start.',
            )
        except Exception:
            logger.exception("auto_absent: failed to create attendance for %s", emp.employee_name)
            continue

        # Notify employee
        if not is_notify_enabled('NOTIFY_AUTO_ABSENT'):
            return
        try:
            queue_notification(
                recipient_name=emp.employee_name,
                phone=emp.employee_phone_number,
                trigger_type='member_absent',
                date=date_str,
                business_name=biz,
            )
        except Exception:
            logger.exception("auto_absent: employee notification failed for %s", emp.employee_name)

        # Notify admin
        if admin_ph:
            try:
                from apps.notifications.models import Notification
                from apps.notifications.utils import TEMPLATES, _norm_phone
                msg = TEMPLATES['member_absent_admin'].format(
                    name=emp.employee_name,
                    employee_code=emp.employee_code,
                    date=date_str,
                    threshold=int(threshold),
                    business_name=biz,
                )
                Notification.objects.create(
                    recipient_name='Admin',
                    recipient_phone=_norm_phone(admin_ph),
                    channel='whatsapp',
                    trigger_type='member_absent',
                    message=msg,
                    status='pending',
                )
            except Exception:
                logger.exception("auto_absent: admin notification failed for %s", emp.employee_name)

        logger.info("auto_absent: marked %s absent for %s", emp.employee_name, today)
