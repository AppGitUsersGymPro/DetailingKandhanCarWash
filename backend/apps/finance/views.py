from calendar import monthrange
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, date, timedelta

from django.db.models import F, Q, DecimalField, Sum, Count, Max
from apps.finance.serializers import ExpenseSerializer
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from apps.jobcards.models import JobCard, JobCardPayment, JobCardProductUsage, SalesOrder
from apps.employees.models import SalaryTransaction, SalaryAdvance
from apps.vendors.models import InvoicePayment
from apps.finance.models import Expense

MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
               'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


def _parse_month(param):
    if param:
        try:
            dt = datetime.strptime(param, '%Y-%m')
            return dt.year, dt.month
        except ValueError:
            return None, None
    today = date.today()
    return today.year, today.month


def _jc_base_gst_total(jc):
    # Service prices are GST-inclusive; back-calculate base and GST portion
    base = sum(s.price_at_time for s in jc.job_card_services.all())
    total = Decimal('0')
    if jc.gst_percent > 0:
        # divisor = Decimal('1') + jc.gst_percent / Decimal('100')
        total = base + (base * jc.gst_percent / Decimal('100'))
        # base = (total / divisor).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        gst  = total - base
    else:
        total = base
        gst  = Decimal('0')
    total = sum(s.quantity * s.unit_price for s in jc.sales_products.all()) + total
    return base, gst, total


def _jc_financials(jc):
    base, gst, total = _jc_base_gst_total(jc)
    paid = sum(p.amount for p in jc.payments.all())
    return base, gst, total, paid


def _allocate_gst_first(amount, gst_liability, cumulative_before):
    """Split `amount` into (gst_portion, base_portion) given GST-first rule
    and how much of the JC was already paid before this payment."""
    cumulative_after = cumulative_before + amount
    if cumulative_after <= gst_liability:
        return amount, Decimal('0')
    if cumulative_before >= gst_liability:
        return Decimal('0'), amount
    gst_portion = gst_liability - cumulative_before
    return gst_portion, amount - gst_portion


def _outstanding_thru(end_date):
    """Returns (total, base, gst) outstanding across every JC billed on or
    before end_date, minus payments received on or before end_date, applying
    GST-first allocation."""
    qs = JobCard.objects.filter(
        job_card_date__lte=end_date,
    ).prefetch_related('job_card_services', 'payments', 'sales_products')

    o_total = o_base = o_gst =Decimal('0')
    for jc in qs:
        base, gst, total = _jc_base_gst_total(jc)
        paid_thru = sum(
            (p.amount for p in jc.payments.all() if p.payment_date <= end_date),
            Decimal('0'),
        )
        if paid_thru <= gst:
            gst_rem  = gst - paid_thru
            base_rem = base
        else:
            gst_rem  = Decimal('0')
            base_rem = max(Decimal('0'), base + gst - paid_thru)
        out = gst_rem + base_rem
        if out > 0:
            o_total += out
            o_base  += base_rem
            o_gst   += gst_rem
    return o_total, o_base, o_gst


def _expense_for_period(year, month):
    salary = SalaryTransaction.objects.filter(
        status='paid',
        payment_date__year=year,
        payment_date__month=month,
    ).aggregate(t=Sum('net_paid'))['t'] or Decimal('0')

    advance = SalaryAdvance.objects.filter(
        status__in=['approved', 'deducted'],
        date__year=year,
        date__month=month,
    ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

    invoice = InvoicePayment.objects.filter(
        payment_date__year=year,
        payment_date__month=month,
    ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

    others = Expense.objects.filter(
        date__year = year,
        date__month = month,
    ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

    return salary + advance + invoice + others


class FinanceDashboardView(APIView):
    def get(self, request):
        year, month = _parse_month(request.query_params.get('month'))
        if year is None:
            return Response({'error': 'Invalid month format. Use YYYY-MM'}, status=status.HTTP_400_BAD_REQUEST)

        current_year      = date.today().year
        end_of_month      = date(year, month, monthrange(year, month)[1])
        end_of_prev_month = date(year, month, 1) - timedelta(days=1)

        # ── Outstanding (cumulative, still owed right now as of end of month).
        # Drops when payments come in this month. Drives the "Outstanding" tile.
        out_total, _, _ = _outstanding_thru(end_of_month)

        # ── To Be Collected (this-month obligation snapshot).
        # = outstanding carried in from previous months  +  full billed amount
        #   of JCs created this month (regardless of payments this month).
        # Does NOT decrease when this month's payments are received; it only
        # rolls forward when the month changes.
        prev_total, prev_base, prev_gst = _outstanding_thru(end_of_prev_month)
        this_total = this_base = this_gst = Decimal('0')
        this_month_jcs = JobCard.objects.filter(
            job_card_date__year=year,
            job_card_date__month=month,
        ).prefetch_related('job_card_services')
        for jc in this_month_jcs:
            base, gst, total = _jc_base_gst_total(jc)
            this_total += total
            this_base  += base
            this_gst   += gst
        direct_sales_order = SalesOrder.objects.filter(
            sale_date__year = year,
            sale_date__month = month,
        ).aggregate(
    total=Sum(F('items__quantity') * F('items__unit_price'), output_field=DecimalField()))['total'] or Decimal('0')
        tbc_total = prev_total + this_total + direct_sales_order
        tbc_base  = prev_base  + this_base + direct_sales_order
        tbc_gst   = prev_gst   + this_gst
        # ── Collected this month: payments whose payment_date falls in this
        # month (regardless of when the JC was created). GST-first split needs
        # the cumulative paid for each JC before this payment.
        col_total = col_base = col_gst = Decimal('0')

        month_pays = JobCardPayment.objects.filter(
            payment_date__year=year,
            payment_date__month=month,
        ).select_related('job_card').prefetch_related(
            'job_card__job_card_services',
            'job_card__payments',
        )

        jc_cache = {}  # jc_id -> (gst_amount, payments_chronological)
        for p in month_pays:
            jc_id = p.job_card_id
            if jc_id not in jc_cache:
                _, gst_amt, _ = _jc_base_gst_total(p.job_card)
                ordered = sorted(
                    p.job_card.payments.all(),
                    key=lambda x: (x.payment_date, x.created_at),
                )
                jc_cache[jc_id] = (gst_amt, ordered)
            gst_amt, ordered = jc_cache[jc_id]

            cumulative_before = Decimal('0')
            for pp in ordered:
                if pp.id == p.id:
                    break
                cumulative_before += pp.amount

            gst_portion, base_portion = _allocate_gst_first(p.amount, gst_amt, cumulative_before)
            col_total += p.amount
            col_base  += base_portion
            col_gst   += gst_portion

        col_total += SalesOrder.objects.filter(
            sale_date__year = year,
            sale_date__month = month
        ).aggregate(total=Sum(F('items__quantity') * F('items__unit_price'), output_field=DecimalField()))['total'] or Decimal('0')
        
        col_base += SalesOrder.objects.filter(
            sale_date__year = year,
            sale_date__month = month
        ).aggregate(total=Sum(F('items__quantity') * F('items__unit_price'), output_field=DecimalField()))['total'] or Decimal('0')
        expense_of_month  = _expense_for_period(year, month)
        net_savings       = col_base - expense_of_month
        outstanding_month = out_total

        # ── Yearly income (billed, current year) ─────────
        year_jcs = JobCard.objects.filter(
            job_card_date__year=current_year,
        ).prefetch_related('job_card_services', 'sales_products')
        yearly_income = Decimal('0')
        for jc in year_jcs:
            yearly_income += sum(s.price_at_time for s in jc.job_card_services.all())
            yearly_income += sum(s.quantity * s.unit_price for s in jc.sales_products.all())
        yearly_income += SalesOrder.objects.filter(
            sale_date__year = current_year,
            ).aggregate(total=Sum(F('items__quantity') * F('items__unit_price'), output_field=DecimalField()))['total'] or Decimal('0')
        # ── Monthly chart (12 months of current year) ────
        # income    = billed for JCs created in that month (what was sold).
        # collected = payments received in that month (when cash came in).
        monthly_chart = []
        for m in range(1, 13):
            m_jcs = JobCard.objects.filter(
                job_card_date__year=current_year,
                job_card_date__month=m,
            ).prefetch_related('job_card_services','sales_products')

            m_income = Decimal('0')
            for jc in m_jcs:
                m_income += sum(s.price_at_time for s in jc.job_card_services.all())
                m_income += sum(s.unit_price * s.quantity for s in jc.sales_products.all())
            m_collected = JobCardPayment.objects.filter(
                payment_date__year=current_year,
                payment_date__month=m,
            ).aggregate(t=Sum('amount'))['t'] or Decimal('0')
            m_collected += SalesOrder.objects.filter(
                sale_date__year = current_year,
                sale_date__month = m,
            ).aggregate(total=Sum(F('items__quantity') * F('items__unit_price'), output_field=DecimalField()))['total'] or Decimal('0')
            m_income += SalesOrder.objects.filter(
                sale_date__year = current_year,
                sale_date__month = m,
            ).aggregate(total=Sum(F('items__quantity') * F('items__unit_price'), output_field=DecimalField()))['total'] or Decimal('0')
            m_expense = _expense_for_period(current_year, m)
            m_savings = m_collected - m_expense

            monthly_chart.append({
                'month':     MONTH_NAMES[m - 1],
                'month_key': f'{current_year}-{m:02d}',
                'income':    float(m_income),
                'expense':   float(m_expense),
                'savings':   float(m_savings),
            })

        return Response({
            'month': f'{year}-{month:02d}',
            'to_be_collected': {
                'total': str(tbc_total),
                'base':  str(tbc_base),
                'gst':   str(tbc_gst),
            },
            'collected': {
                'total': str(col_total),
                'base':  str(col_base),
                'gst':   str(col_gst),
            },
            'yearly_income':      str(yearly_income),
            'net_savings':        str(net_savings),
            'expense_of_month':   str(expense_of_month),
            'outstanding_of_month': str(outstanding_month),
            'monthly_chart':      monthly_chart,
        })


class FinanceIncomeView(APIView):
    def get(self, request):
        year, month = _parse_month(request.query_params.get('month'))
        if year is None:
            return Response({'error': 'Invalid month format. Use YYYY-MM'}, status=status.HTTP_400_BAD_REQUEST)

        search = request.query_params.get('search', '').strip()

        # One row per payment received in this month (not per job card).
        pay_qs = JobCardPayment.objects.filter(
            payment_date__year=year,
            payment_date__month=month,
        ).select_related(
            'job_card__customer_asset__customer',
        ).prefetch_related(
            'job_card__job_card_services__service',
        )


        if search:
            pay_qs = pay_qs.filter(
                Q(job_card__job_card_number__icontains=search) |
                Q(job_card__customer_asset__customer__customer_name__icontains=search) |
                Q(job_card__customer_asset__vehicle_number__icontains=search)
            )

        # Cache per-JC totals + chronological payment list so outstanding-after-this-payment
        # can be computed cheaply when multiple payments belong to the same job card.
        jc_cache = {}

        results = []
        for p in pay_qs.order_by('-payment_date', '-created_at'):
            jc = p.job_card
            if jc.id not in jc_cache:
                base, gst, total, _ = _jc_financials(jc)
                ordered_pays = list(jc.payments.order_by('payment_date', 'created_at'))
                jc_cache[jc.id] = {
                    'base': base, 'gst': gst, 'total': total,
                    'ordered_pays': ordered_pays,
                }
            info = jc_cache[jc.id]

            cumulative = Decimal('0')
            for pp in info['ordered_pays']:
                cumulative += pp.amount
                if pp.id == p.id:
                    break

            # GST-first allocation: payments clear the GST liability first, then base.
            jc_gst, jc_base, jc_total = info['gst'], info['base'], info['total']
            if cumulative <= jc_gst:
                gst_to_collect  = jc_gst - cumulative
                base_to_collect = jc_base
            else:
                gst_to_collect  = Decimal('0')
                base_to_collect = max(Decimal('0'), jc_total - cumulative)
            outstanding_after = gst_to_collect + base_to_collect

            pstatus = 'paid' if outstanding_after <= 0 else 'partial'

            service_names = ', '.join(
                s.service.service_name for s in jc.job_card_services.all()
            )

            results.append({
                'id':                f'pay-{p.id}',
                'date':              p.payment_date.isoformat(),
                'job_card_number':   jc.job_card_number,
                'customer_name':     jc.customer_asset.customer.customer_name if jc.customer_asset else '',
                'vehicle_number':    jc.customer_asset.vehicle_number if jc.customer_asset else '',
                'services':          service_names,
                'base_amount':       str(jc_base),
                'gst_percent':       str(jc.gst_percent),
                'gst_amount':        str(jc_gst),
                'total_amount':      str(jc_total),
                'paid_amount':       str(p.amount),
                'base_to_collect':   str(base_to_collect),
                'gst_to_collect':    str(gst_to_collect),
                'outstanding':       str(outstanding_after),
                'payment_status':    pstatus,
                'payment_method':    p.payment_method,
                'category':          'Job Card',
            })
        sales_qs = SalesOrder.objects.filter(
            sale_date__year = year,
            sale_date__month = month,
        ).prefetch_related('items__inventory__product')

        if search:
            sales_qs = sales_qs.filter(
                Q(items__inventory__product__product_name__icontains=search)
            )
        for so in sales_qs:
            #amount = sum(item.quantity * item.unit_price for item in so.items.all())
            results.append({
                'id':              f'sales-{so.id}',
                'date':            so.sale_date.isoformat(),
                'job_card_number': so.order_number,          # not tied to a job card
                'customer_name':   so.customer_name,          # fill in if SalesOrder has a customer link
                'vehicle_number':  '',
                'services':        ', '.join(i.inventory.product.product_name for i in so.items.all()),
                'base_amount':     str(so.total_amount),
                'gst_percent':     '0',
                'gst_amount':      '0',
                'total_amount':    str(so.total_amount),
                'paid_amount':     str(so.total_amount),  # sales are presumably paid at time of sale
                'base_to_collect': '0',
                'gst_to_collect':  '0',
                'outstanding':     '0',
                'payment_status':  'paid',
                'payment_method':  '',           # fill in if SalesOrder tracks this
                'category':        'Sales Product',
            })
        
        results.sort(key=lambda x:x['date'], reverse=True)

        return Response(results)


class FinanceExpenseView(APIView):
    def get(self, request):
        year, month = _parse_month(request.query_params.get('month'))
        if year is None:
            return Response({'error': 'Invalid month format. Use YYYY-MM'}, status=status.HTTP_400_BAD_REQUEST)

        category = request.query_params.get('category', '').strip().lower()
        search   = request.query_params.get('search', '').strip().lower()

        results = []

        if not category or category == 'salary':
            for s in Expense.objects.filter(
                date__year=year,
                date__month=month,
                category = 'salary',
            ).order_by('-date'):
                desc = s.description
                if not search or search in desc.lower():
                    results.append({
                        'id':          s.id,
                        'date':        s.date.isoformat(),
                        'description': s.customer,
                        'amount':      str(s.amount),
                        'category':    'Salary',
                        'reference':   s.reference,
                    })

        if not category or category == 'advance':
            for a in Expense.objects.filter(
                category = "advance",
                date__year=year,
                date__month=month,
            ).order_by('-date'):
                desc = f"Advance – {a.customer}"
                if not search or search in desc.lower():
                    results.append({
                        'id':          f'adv-{a.id}',
                        'date':        a.date.isoformat(),
                        'description': a.customer,
                        'amount':      str(a.amount),
                        'category':    'Advance',
                        'reference':   a.id,
                    })

        if not category or category == 'vendor_invoice':
            for ip in Expense.objects.filter(
                date__year=year,
                date__month=month,
                category = 'vendor_invoice',
            ).order_by('-date'):
                desc = ip.description
                if not search or search in desc.lower():
                    results.append({
                        'id':          f'inv-{ip.id}',
                        'date':        ip.date.isoformat(),
                        'description': ip.customer,
                        'amount':      str(ip.amount),
                        'category':    'Vendor Invoice',
                        'reference':   ip.reference,
                    })

        if not category or category == "others":
            for e in Expense.objects.filter(
                date__year=year,
                date__month=month,
            ).order_by('-date'):
                desc = e.description
                if not search or search in desc.lower():
                    results.append({
                        'id':          f'exp-{e.id}',
                        'date':        e.date.isoformat(),
                        'description': e.customer,
                        'amount':      str(e.amount),
                        'category':    e.category,
                        'reference':   e.reference or '',
                    })
        results.sort(key=lambda x: x['date'], reverse=True)   
        return Response(results)
    
    def post(self, request):
        print("Hello")
        serializer = ExpenseSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─────────────────────────────────────────────────────────────────────────────
# Helper: cumulative cash expenses BEFORE a given date (for opening balance)
# ─────────────────────────────────────────────────────────────────────────────

def _expense_total_before_date(before_date):
    salary = SalaryTransaction.objects.filter(
        status='paid', payment_date__lt=before_date
    ).aggregate(t=Sum('net_paid'))['t'] or Decimal('0')
    advance = SalaryAdvance.objects.filter(
        status__in=['approved', 'deducted'], date__lt=before_date
    ).aggregate(t=Sum('amount'))['t'] or Decimal('0')
    invoice = InvoicePayment.objects.filter(
        payment_date__lt=before_date
    ).aggregate(t=Sum('amount'))['t'] or Decimal('0')
    return salary + advance + invoice


# ─────────────────────────────────────────────────────────────────────────────
# Daily Closing Report
# ─────────────────────────────────────────────────────────────────────────────

class DailyReportView(APIView):
    def get(self, request):
        date_str = request.query_params.get('date')
        if date_str:
            try:
                report_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            except ValueError:
                return Response({'error': 'Invalid date. Use YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            report_date = date.today()

        # ── Job cards created on this date ──────────────────────────────
        day_jcs = JobCard.objects.filter(
            job_card_date=report_date,
        ).prefetch_related('job_card_services__service', 'payments').select_related(
            'customer_asset__customer'
        )

        total_billed    = Decimal('0')
        total_collected = Decimal('0')
        service_map     = {}   # service_name -> {jobs, billed, collected}
        pending_sales   = []

        for jc in day_jcs:
            base, gst, total, paid = _jc_financials(jc)
            outstanding = total - paid
            total_billed    += total
            total_collected += paid

            # Service-level revenue + collection split
            for svc in jc.job_card_services.all():
                sname = svc.service.service_name
                if sname not in service_map:
                    service_map[sname] = {
                        'jobs': 0,
                        'billed':    Decimal('0'),
                        'collected': Decimal('0'),
                    }
                service_map[sname]['jobs'] += 1
                service_map[sname]['billed'] += svc.price_at_time
                # Proportional collection
                if total > 0:
                    service_map[sname]['collected'] += (
                        (svc.price_at_time / total) * paid
                    ).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

            if outstanding > 0:
                pending_sales.append({
                    'job_card_number': jc.job_card_number,
                    'customer':  jc.customer_asset.customer.customer_name if jc.customer_asset else '',
                    'vehicle':   jc.customer_asset.vehicle_number if jc.customer_asset else '',
                    'vehicle_type': jc.customer_asset.vehicle_type if jc.customer_asset else '',
                    'services':  ', '.join(
                        s.service.service_name for s in jc.job_card_services.all()
                    ),
                    'total':       str(total),
                    'paid':        str(paid),
                    'outstanding': str(outstanding),
                })

        # ── Payment mode breakdown (payments for job cards opened on report_date) ──
        # Using job_card__job_card_date so the breakdown is consistent with
        # total_collected in the summary (both are based on job cards opened today).
        mode_qs = JobCardPayment.objects.filter(
            job_card__job_card_date=report_date,
        ).values('payment_method').annotate(
            amount=Sum('amount'),
            count=Count('id'),
        ).order_by('-amount')

        payment_breakdown = [
            {
                'method': pm['payment_method'],
                'amount': str(pm['amount'] or Decimal('0')),
                'count':  pm['count'],
            }
            for pm in mode_qs
        ]

        # ── Expenses paid out today ──────────────────────────────────────
        expense_items = []

        for s in SalaryTransaction.objects.filter(
            status='paid', payment_date=report_date
        ).select_related('employee'):
            expense_items.append({
                'description': f'Salary – {s.employee.employee_name}',
                'amount':      str(s.net_paid),
                'category':    'Salary',
            })

        for a in SalaryAdvance.objects.filter(
            status__in=['approved', 'deducted'], date=report_date
        ).select_related('employee'):
            expense_items.append({
                'description': f'Advance – {a.employee.employee_name}',
                'amount':      str(a.amount),
                'category':    'Advance',
            })

        for ip in InvoicePayment.objects.filter(
            payment_date=report_date
        ).select_related('invoice__vendor'):
            expense_items.append({
                'description': f'{ip.invoice.vendor.vendor_name} · {ip.invoice.invoice_number}',
                'amount':      str(ip.amount),
                'category':    'Vendor',
            })

        total_expenses = sum((Decimal(e['amount']) for e in expense_items), Decimal('0'))

        # ── Flow statement (all payment modes) ──────────────────────────
        # Total collected for job cards opened on this date (all modes)
        collected_today = JobCardPayment.objects.filter(
            job_card__job_card_date=report_date,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

        # Opening balance = all payments received for job cards before this date − all expenses before this date
        collected_before = JobCardPayment.objects.filter(
            job_card__job_card_date__lt=report_date,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')
        exp_before  = _expense_total_before_date(report_date)
        opening_bal = collected_before - exp_before
        closing_bal = opening_bal + collected_today - total_expenses

        # ── Inventory products consumed on this date (most used first) ─────
        usage_qs = (
            JobCardProductUsage.objects
            .filter(job_card_product__job_card_service__job_card__job_card_date=report_date)
            .values(
                'product__product__product_name',
                'product__brand',
                'product__product__product_unit',
            )
            .annotate(
                total_qty=Sum('quantity_used'),
                unit_amount=Max('product__unit_amount'),
            )
            .order_by('-total_qty')[:5]
        )
        product_usage = [
            {
                'product_name': row['product__product__product_name'],
                'brand':        row['product__brand'] or '',
                'unit':         row['product__product__product_unit'],
                'unit_amount':  str(row['unit_amount'] or 1),
                'total_qty':    str(row['total_qty']),
            }
            for row in usage_qs
        ]

        # ── Service revenue list (sorted by billed desc) ─────────────────
        service_revenue = sorted([
            {
                'service_name': k,
                'jobs':         v['jobs'],
                'billed':       str(v['billed'].quantize(Decimal('0.01'))),
                'collected':    str(v['collected'].quantize(Decimal('0.01'))),
                'outstanding':  str((v['billed'] - v['collected']).quantize(Decimal('0.01'))),
            }
            for k, v in service_map.items()
        ], key=lambda x: Decimal(x['billed']), reverse=True)

        return Response({
            'date': report_date.isoformat(),
            'summary': {
                'total_billed':      str(total_billed),
                'total_collected':   str(total_collected),
                'outstanding':       str(total_billed - total_collected),
                'vehicles_serviced': day_jcs.count(),
            },
            'payment_breakdown': payment_breakdown,
            'service_revenue':   service_revenue,
            'pending_sales':     pending_sales,
            'product_usage':  product_usage,
            'cash_expenses': {
                'total': str(total_expenses),
                'items': expense_items,
            },
            'cash_flow': {
                'opening_balance': str(opening_bal.quantize(Decimal('0.01'))),
                'cash_collected':  str(collected_today.quantize(Decimal('0.01'))),
                'cash_expenses':   str(total_expenses.quantize(Decimal('0.01'))),
                'closing_balance': str(closing_bal.quantize(Decimal('0.01'))),
            },
        })
