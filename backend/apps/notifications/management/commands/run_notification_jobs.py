from django.core.management.base import BaseCommand

from apps.notifications.jobs import notify_service_due


class Command(BaseCommand):
    help = 'Run scheduled WhatsApp notification jobs (service due reminders)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days-ahead',
            type=int,
            default=7,
            help='Days ahead to check for service due reminders (default: 7)',
        )

    def handle(self, *args, **options):
        days = options['days_ahead']
        self.stdout.write(f'Running service due reminders ({days} days ahead)...')
        notify_service_due(days_ahead=days)
        self.stdout.write(self.style.SUCCESS('Done.'))
