# somewhere shared, e.g. apps/jobcards/utils.py
from decimal import Decimal

def recalculate_total(job_card):
    services_total = sum(s.price_at_time for s in job_card.job_card_services.all())
    sales_total = sum(sp.quantity * sp.unit_price for sp in job_card.sales_products.all())
    gst = services_total* job_card.gst_percent / Decimal('100')
    job_card.total_amount = services_total + sales_total + gst
    job_card.save(update_fields=['total_amount'])