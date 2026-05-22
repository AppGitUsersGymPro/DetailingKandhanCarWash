from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, date

from django.db.models import Q, Sum
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from apps.jobcards.models import JobCard
from apps.employees.models import SalaryTransaction, SalaryAdvance
from apps.vendors.models import InvoicePayment


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


def _jc_financials(jc):
    base  = sum(s.price_at_time for s in jc.job_card_services.all())
    gst   = (base * jc.gst_percent / Decimal('100')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    total = base + gst
    paid  = sum(p.amount for p in jc.payments.all())
    return base, gst, total, paid


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

    return salary + advance + invoice


class FinanceDashboardView(APIView):
    def get(self, request):
        year, month = _parse_month(request.query_params.get('month'))
        if year is None:
            return Response({'error': 'Invalid month format. Use YYYY-MM'}, status=status.HTTP_400_BAD_REQUEST)

        current_year = date.today().year

        # ── Month job cards ──────────────────────────────
        month_jcs = JobCard.objects.filter(
            job_card_date__year=year,
            job_card_date__month=month,
        ).prefetch_related('job_card_services', 'payments')

        tbc_total = tbc_base = tbc_gst = Decimal('0')
        col_total = col_base = col_gst = Decimal('0')

        for jc in month_jcs:
            base, gst, total, paid = _jc_financials(jc)
            outstanding = total - paid

            if total > 0:
                base_r = base / total
                gst_r  = gst  / total
            else:
                base_r = gst_r = Decimal('0')

            if outstanding > 0:
                tbc_total += outstanding
                tbc_base  += (outstanding * base_r).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                tbc_gst   += (outstanding * gst_r ).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

            if paid > 0:
                col_total += paid
                col_base  += (paid * base_r).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                col_gst   += (paid * gst_r ).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        expense_of_month   = _expense_for_period(year, month)
        net_savings        = col_total - expense_of_month
        outstanding_month  = tbc_total

        # ── Yearly income (billed, current year) ─────────
        year_jcs = JobCard.objects.filter(
            job_card_date__year=current_year,
        ).prefetch_related('job_card_services')
        yearly_income = Decimal('0')
        for jc in year_jcs:
            base  = sum(s.price_at_time for s in jc.job_card_services.all())
            gst   = (base * jc.gst_percent / Decimal('100')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            yearly_income += base + gst

        # ── Monthly chart (12 months of current year) ────
        monthly_chart = []
        for m in range(1, 13):
            m_jcs = JobCard.objects.filter(
                job_card_date__year=current_year,
                job_card_date__month=m,
            ).prefetch_related('job_card_services', 'payments')

            m_income = m_collected = Decimal('0')
            for jc in m_jcs:
                base, gst, total, paid = _jc_financials(jc)
                m_income    += total
                m_collected += paid

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

        qs = JobCard.objects.filter(
            job_card_date__year=year,
            job_card_date__month=month,
        ).prefetch_related('job_card_services__service', 'payments').select_related(
            'customer_asset__customer'
        )

        if search:
            qs = qs.filter(
                Q(job_card_number__icontains=search) |
                Q(customer_asset__customer__customer_name__icontains=search) |
                Q(customer_asset__vehicle_number__icontains=search)
            )

        results = []
        for jc in qs.order_by('-job_card_date'):
            base, gst, total, paid = _jc_financials(jc)
            outstanding = total - paid

            if total <= 0:
                pstatus = 'unpaid'
            elif paid >= total:
                pstatus = 'paid'
            elif paid > 0:
                pstatus = 'partial'
            else:
                pstatus = 'unpaid'

            service_names = ', '.join(
                s.service.service_name for s in jc.job_card_services.all()
            )

            results.append({
                'id':             jc.id,
                'date':           jc.job_card_date.isoformat(),
                'job_card_number': jc.job_card_number,
                'customer_name':  jc.customer_asset.customer.customer_name if jc.customer_asset else '',
                'vehicle_number': jc.customer_asset.vehicle_number if jc.customer_asset else '',
                'services':       service_names,
                'base_amount':    str(base),
                'gst_percent':    str(jc.gst_percent),
                'gst_amount':     str(gst),
                'total_amount':   str(total),
                'paid_amount':    str(paid),
                'outstanding':    str(outstanding),
                'payment_status': pstatus,
                'category':       'Job Card',
            })

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
            for s in SalaryTransaction.objects.filter(
                status='paid',
                payment_date__year=year,
                payment_date__month=month,
            ).select_related('employee').order_by('-payment_date'):
                desc = f"Salary – {s.employee.employee_name} ({s.month.strftime('%b %Y')})"
                if not search or search in desc.lower():
                    results.append({
                        'id':          f'sal-{s.id}',
                        'date':        s.payment_date.isoformat(),
                        'description': desc,
                        'amount':      str(s.net_paid),
                        'category':    'Salary',
                        'reference':   f'{s.employee.employee_code} · {s.month.strftime("%b %Y")}',
                    })

        if not category or category == 'advance':
            for a in SalaryAdvance.objects.filter(
                status__in=['approved', 'deducted'],
                date__year=year,
                date__month=month,
            ).select_related('employee').order_by('-date'):
                desc = f"Advance – {a.employee.employee_name}"
                if not search or search in desc.lower():
                    results.append({
                        'id':          f'adv-{a.id}',
                        'date':        a.date.isoformat(),
                        'description': desc,
                        'amount':      str(a.amount),
                        'category':    'Advance',
                        'reference':   f'{a.employee.employee_code} · {a.date}',
                    })

        if not category or category == 'vendor_invoice':
            for ip in InvoicePayment.objects.filter(
                payment_date__year=year,
                payment_date__month=month,
            ).select_related('invoice__vendor').order_by('-payment_date'):
                desc = f"Invoice – {ip.invoice.invoice_number} ({ip.invoice.vendor.vendor_name})"
                if not search or search in desc.lower():
                    results.append({
                        'id':          f'inv-{ip.id}',
                        'date':        ip.payment_date.isoformat(),
                        'description': desc,
                        'amount':      str(ip.amount),
                        'category':    'Vendor Invoice',
                        'reference':   ip.invoice.invoice_number,
                    })

        results.sort(key=lambda x: x['date'], reverse=True)
        return Response(results)
