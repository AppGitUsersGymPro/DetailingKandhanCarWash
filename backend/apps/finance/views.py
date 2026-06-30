from calendar import monthrange
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, date, timedelta

from django.db.models import F, Q, DecimalField, Sum, Count, Max, Prefetch
from django.db.models.functions import ExtractMonth
from apps.finance.serializers import ExpenseSerializer
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from apps.jobcards.models import JobCard, JobCardPayment, JobCardProductUsage, SalesOrder, SalesOrderItem
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
    return Expense.objects.filter(
        date__year=year,
        date__month=month,
    ).aggregate(t=Sum('amount'))['t'] or Decimal('0')


class FinanceDashboardView(APIView):
    def get(self, request):
        year, month = _parse_month(request.query_params.get('month'))
        if year is None:
            return Response({'error': 'Invalid month format. Use YYYY-MM'}, status=status.HTTP_400_BAD_REQUEST)

        current_year = date.today().year

        # ── Chart maps first (4 queries) ─────────────────────────────────
        # Run these before tile queries so we can reuse them when year == current_year.
        jc_income_map = {
            row['m']: row['t']
            for row in JobCard.objects
                .filter(job_card_date__year=current_year, total_amount__isnull=False)
                .annotate(m=ExtractMonth('job_card_date'))
                .values('m')
                .annotate(t=Sum('total_amount'))
        }
        so_map = {
            row['m']: row['t']
            for row in SalesOrder.objects
                .filter(sale_date__year=current_year)
                .annotate(m=ExtractMonth('sale_date'))
                .values('m')
                .annotate(t=Sum('total_amount'))
        }
        jc_collected_map = {
            row['m']: row['t']
            for row in JobCardPayment.objects
                .filter(payment_date__year=current_year)
                .annotate(m=ExtractMonth('payment_date'))
                .values('m')
                .annotate(t=Sum('amount'))
        }
        expense_map = {
            row['m']: row['t']
            for row in Expense.objects
                .filter(date__year=current_year)
                .annotate(m=ExtractMonth('date'))
                .values('m')
                .annotate(t=Sum('amount'))
        }

        # ── Tile values: derive from maps when viewing current year ───────
        if year == current_year:
            so_month_total   = so_map.get(month)      or Decimal('0')
            expense_of_month = expense_map.get(month) or Decimal('0')
        else:
            so_month_total   = SalesOrder.objects.filter(
                sale_date__year=year, sale_date__month=month,
            ).aggregate(t=Sum('total_amount'))['t'] or Decimal('0')
            expense_of_month = _expense_for_period(year, month)

        # ── To be collected: billed in this month ────────────────────────
        jc_tbc = JobCard.objects.filter(
            job_card_date__year=year,
            job_card_date__month=month,
            total_amount__isnull=False,
        ).aggregate(
            total=Sum('total_amount'),
            base=Sum('base_amount'),
            gst=Sum('gst_amount'),
        )

        tbc_total = (jc_tbc['total'] or Decimal('0')) + so_month_total
        tbc_base  = (jc_tbc['base']  or Decimal('0')) + so_month_total
        tbc_gst   =  jc_tbc['gst']   or Decimal('0')

        # ── Collected: read stored gst_collected / base_collected ────────
        payment_data = JobCardPayment.objects.filter(
            payment_date__year=year,
            payment_date__month=month,
        ).aggregate(
            total_collected=Sum('amount'),
            gst_collected=Sum('gst_collected'),
            base_collected=Sum('base_collected'),
        )

        jc_col_total      = payment_data['total_collected'] or Decimal('0')
        col_total         = jc_col_total + so_month_total
        col_gst           = (payment_data['gst_collected']  or Decimal('0')).quantize(Decimal('0.01'))
        col_base          = (payment_data['base_collected'] or Decimal('0')) + so_month_total
        outstanding_month = tbc_total - col_total
        net_savings       = col_base - expense_of_month

        yearly_income = (
            sum(jc_income_map.values(), Decimal('0')) +
            sum(so_map.values(), Decimal('0'))
        )

        monthly_chart = []
        for m in range(1, 13):
            m_collected = (jc_collected_map.get(m) or Decimal('0')) + (so_map.get(m) or Decimal('0'))
            m_expense   = expense_map.get(m) or Decimal('0')
            m_savings   = m_collected - m_expense
            monthly_chart.append({
                'month':     MONTH_NAMES[m - 1],
                'month_key': f'{current_year}-{m:02d}',
                'income':    float(m_collected),
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
            'job_card__payments',
        )

        if search:
            pay_qs = pay_qs.filter(
                Q(job_card__job_card_number__icontains=search) |
                Q(job_card__customer_asset__customer__customer_name__icontains=search) |
                Q(job_card__customer_asset__vehicle_number__icontains=search)
            )

        jc_cache = {}

        results = []
        for p in pay_qs.order_by('-payment_date', '-created_at'):
            jc = p.job_card
            if jc.id not in jc_cache:
                base  = jc.base_amount  or Decimal('0')
                gst   = jc.gst_amount   or Decimal('0')
                total = jc.total_amount or Decimal('0')
                ordered_pays = sorted(jc.payments.all(), key=lambda x: (x.payment_date, x.created_at))
                jc_cache[jc.id] = {
                    'base': base, 'gst': gst, 'total': total,
                    'ordered_pays': ordered_pays,
                }
            info = jc_cache[jc.id]

            cumulative_gst  = Decimal('0')
            cumulative_base = Decimal('0')
            for pp in info['ordered_pays']:
                cumulative_gst  += pp.gst_collected  or Decimal('0')
                cumulative_base += pp.base_collected or Decimal('0')
                if pp.id == p.id:
                    break

            gst_to_collect  = max(Decimal('0'), info['gst']  - cumulative_gst)
            base_to_collect = max(Decimal('0'), info['base'] - cumulative_base)
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
                'base_amount':       str(info['base']),
                'gst_percent':       str(jc.gst_percent),
                'gst_amount':        str(info['gst']),
                'total_amount':      str(info['total']),
                'paid_amount':       str(p.amount),
                'base_to_collect':   str(base_to_collect),
                'gst_to_collect':    str(gst_to_collect),
                'outstanding':       str(outstanding_after),
                'payment_status':    pstatus,
                'payment_method':    p.payment_method,
                'category':          'Job Card',
            })
        sales_qs = SalesOrder.objects.filter(
            sale_date__year=year,
            sale_date__month=month,
        ).prefetch_related(
            Prefetch('items', queryset=SalesOrderItem.objects.select_related('inventory__product'))
        )

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

        CAT_LABEL = {
            'salary':         'Salary',
            'advance':        'Advance',
            'vendor_invoice': 'Vendor Invoice',
        }

        qs = Expense.objects.filter(
            date__year=year, date__month=month
        ).order_by('-date')
        if category:
            qs = qs.filter(category=category)
        if search:
            qs = qs.filter(
                Q(customer__icontains=search) | Q(description__icontains=search)
            )

        results = [
            {
                'id':          e.id,
                'date':        e.date.isoformat(),
                'description': e.customer or '',
                'amount':      str(e.amount),
                'category':    CAT_LABEL.get(e.category, e.category or 'Other'),
                'reference':   e.reference or '',
            }
            for e in qs
        ]
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
    return Expense.objects.filter(
        date__lt=before_date,
    ).aggregate(t=Sum('amount'))['t'] or Decimal('0')


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

        # ── Summary totals via aggregates (no Python loop needed) ──────
        jc_billed = JobCard.objects.filter(
            job_card_date=report_date,
            total_amount__isnull=False,
        ).aggregate(t=Sum('total_amount'))['t'] or Decimal('0')

        so_today_total = SalesOrder.objects.filter(
            sale_date=report_date,
        ).aggregate(t=Sum('total_amount'))['t'] or Decimal('0')

        total_billed = jc_billed + so_today_total

        jc_collected_summary = JobCardPayment.objects.filter(
            job_card__job_card_date=report_date,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

        total_collected = jc_collected_summary + so_today_total

        # ── Per-JC detail for service breakdown and pending list ─────────
        day_jcs = JobCard.objects.filter(
            job_card_date=report_date,
        ).prefetch_related('job_card_services__service', 'payments').select_related(
            'customer_asset__customer'
        )

        service_map   = {}
        pending_sales = []
        vehicles_serviced = 0

        for jc in day_jcs:
            vehicles_serviced += 1
            total = jc.total_amount or Decimal('0')
            paid  = sum(p.amount for p in jc.payments.all())
            outstanding = total - paid

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

        # ── Payment mode breakdown (JC payments + SO sales on report_date) ──
        payment_map = {}
        for pm in JobCardPayment.objects.filter(
            payment_date=report_date,
        ).values('payment_method').annotate(amount=Sum('amount'), count=Count('id')):
            payment_map[pm['payment_method']] = {
                'amount': pm['amount'] or Decimal('0'),
                'count':  pm['count'],
            }
        for pm in SalesOrder.objects.filter(
            sale_date=report_date,
        ).values('payment_method').annotate(amount=Sum('total_amount'), count=Count('id')):
            method = pm['payment_method']
            so_amt = pm['amount'] or Decimal('0')
            if method in payment_map:
                payment_map[method]['amount'] += so_amt
                payment_map[method]['count']  += pm['count']
            else:
                payment_map[method] = {'amount': so_amt, 'count': pm['count']}

        payment_breakdown = [
            {'method': m, 'amount': str(d['amount']), 'count': d['count']}
            for m, d in sorted(payment_map.items(), key=lambda x: -x[1]['amount'])
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

        # ── Flow statement: JC payments by payment_date + SO sales by sale_date ─
        jc_collected_today = JobCardPayment.objects.filter(
            payment_date=report_date,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')
        collected_today = jc_collected_today + so_today_total

        jc_collected_before = JobCardPayment.objects.filter(
            payment_date__lt=report_date,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')
        so_before_total = SalesOrder.objects.filter(
            sale_date__lt=report_date,
        ).aggregate(t=Sum('total_amount'))['t'] or Decimal('0')
        collected_before = jc_collected_before + so_before_total

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
                'vehicles_serviced': vehicles_serviced,
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
