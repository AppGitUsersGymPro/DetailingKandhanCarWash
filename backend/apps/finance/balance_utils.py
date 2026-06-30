from decimal import Decimal
from datetime import datetime
from django.db.models import F


def _get_prev_closing(for_date):
    from apps.finance.models import DailyBalance
    prev = DailyBalance.objects.filter(date__lt=for_date).order_by('-date').first()
    return prev.closing_balance if prev else Decimal('0')


def update_daily_balance(for_date, collected_delta=Decimal('0'), expense_delta=Decimal('0')):
    from apps.finance.models import DailyBalance
    if isinstance(for_date, str):
        for_date = datetime.strptime(for_date, '%Y-%m-%d').date()

    collected_delta = Decimal(str(collected_delta))
    expense_delta   = Decimal(str(expense_delta))

    opening = _get_prev_closing(for_date)
    DailyBalance.objects.get_or_create(
        date=for_date,
        defaults={
            'opening_balance': opening,
            'collected':       Decimal('0'),
            'expenses':        Decimal('0'),
            'closing_balance': opening,
        }
    )
    DailyBalance.objects.filter(date=for_date).update(
        collected=F('collected') + collected_delta,
        expenses=F('expenses') + expense_delta,
        closing_balance=F('closing_balance') + collected_delta - expense_delta,
    )
