from decimal import Decimal


def recalculate_total(job_card):
    services_base = sum(s.price_at_time for s in job_card.job_card_services.all())
    sales_total   = sum(sp.quantity * sp.unit_price for sp in job_card.sales_products.all())
    gst           = services_base * job_card.gst_percent / Decimal('100')
    job_card.base_amount  = services_base + sales_total
    job_card.gst_amount   = gst
    job_card.total_amount = services_base + sales_total + gst
    job_card.save(update_fields=['base_amount', 'gst_amount', 'total_amount'])


def compute_gst_split(job_card, amount):
    """
    Returns (gst_collected, base_collected) for a new payment of `amount`.
    GST-first: remaining GST liability is cleared before base amount.
    Call BEFORE saving the new payment so it isn't included in the sum.
    """
    already_gst = sum(
        p.gst_collected or Decimal('0')
        for p in job_card.payments.all()
    )
    remaining_gst  = max(Decimal('0'), (job_card.gst_amount or Decimal('0')) - already_gst)
    gst_collected  = min(amount, remaining_gst)
    base_collected = amount - gst_collected
    return gst_collected, base_collected


def recompute_payment_gst(job_card):
    """
    Recomputes gst_collected / base_collected for ALL existing payments on a job card
    in chronological order. Call after a payment is deleted so subsequent payments
    are corrected (deleting payment 1 frees up GST room for payment 2+).
    """
    from apps.jobcards.models import JobCardPayment
    payments = list(job_card.payments.order_by('payment_date', 'created_at'))
    gst_limit      = job_card.gst_amount or Decimal('0')
    cumulative_gst = Decimal('0')
    for p in payments:
        remaining      = max(Decimal('0'), gst_limit - cumulative_gst)
        p.gst_collected  = min(p.amount, remaining)
        p.base_collected = p.amount - p.gst_collected
        cumulative_gst  += p.gst_collected
    if payments:
        JobCardPayment.objects.bulk_update(payments, ['gst_collected', 'base_collected'])