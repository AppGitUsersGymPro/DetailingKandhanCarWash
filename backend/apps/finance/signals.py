from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver


# ── Expense signals (covers salary, advance, vendor invoice, manual) ──────────

@receiver(post_save, sender='finance.Expense')
def expense_created(sender, instance, created, **kwargs):
    if created:
        from apps.finance.balance_utils import update_daily_balance
        update_daily_balance(instance.date, expense_delta=instance.amount)


@receiver(post_delete, sender='finance.Expense')
def expense_deleted(sender, instance, **kwargs):
    from apps.finance.balance_utils import update_daily_balance
    update_daily_balance(instance.date, expense_delta=-instance.amount)


# ── JobCardPayment signals ────────────────────────────────────────────────────

@receiver(post_save, sender='jobcards.JobCardPayment')
def payment_created(sender, instance, created, **kwargs):
    if created:
        from apps.finance.balance_utils import update_daily_balance
        update_daily_balance(instance.payment_date, collected_delta=instance.amount)


@receiver(post_delete, sender='jobcards.JobCardPayment')
def payment_deleted(sender, instance, **kwargs):
    from apps.finance.balance_utils import update_daily_balance
    update_daily_balance(instance.payment_date, collected_delta=-instance.amount)


# ── SalesOrder signals ────────────────────────────────────────────────────────

@receiver(post_save, sender='jobcards.SalesOrder')
def sales_order_created(sender, instance, created, **kwargs):
    if created:
        from apps.finance.balance_utils import update_daily_balance
        update_daily_balance(instance.sale_date, collected_delta=instance.total_amount)


@receiver(post_delete, sender='jobcards.SalesOrder')
def sales_order_deleted(sender, instance, **kwargs):
    from apps.finance.balance_utils import update_daily_balance
    update_daily_balance(instance.sale_date, collected_delta=-instance.total_amount)
