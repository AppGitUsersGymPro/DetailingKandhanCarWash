import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from django.conf import settings

logger = logging.getLogger(__name__)

_scheduler = None


def _job_service_reminder():
    """Runs daily at 10 AM — queues reminders for vehicles due in 2 days AND due today."""
    try:
        from apps.notifications.jobs import notify_service_due, notify_service_due_today
        logger.info("Scheduler: running service reminder (2-day advance)")
        notify_service_due(days_ahead=2)
        logger.info("Scheduler: running service due today")
        notify_service_due_today()
    except Exception:
        logger.exception("Scheduler: service reminder job failed")


def _job_auto_absent():
    """Runs every hour — marks absent any employee whose shift started > threshold hours ago with no check-in."""
    try:
        from apps.notifications.jobs import run_auto_absent
        logger.info("Scheduler: running auto-absent check")
        run_auto_absent()
    except Exception:
        logger.exception("Scheduler: auto-absent job failed")


def start():
    global _scheduler
    if _scheduler is not None:
        return  # guard against double-start

    tz = getattr(settings, 'TIME_ZONE', 'UTC')

    _scheduler = BackgroundScheduler(timezone=tz)

    # Daily at 10:00 AM — service due reminders
    _scheduler.add_job(
        _job_service_reminder,
        CronTrigger(hour=10, minute=0, timezone=tz),
        id='service_reminder',
        replace_existing=True,
        misfire_grace_time=3600,  # still run if server was down at 10 AM, as long as < 1 hr late
    )

    # Every 1 hour — auto-absent checks
    _scheduler.add_job(
        _job_auto_absent,
        IntervalTrigger(hours=1),
        id='auto_absent',
        replace_existing=True,
        misfire_grace_time=600,
    )

    _scheduler.start()
    logger.info(
        "Notification scheduler started — "
        "service_reminder: daily 10:00 AM | auto_absent: every 1 hr"
    )


def stop():
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
