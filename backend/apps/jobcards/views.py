from collections import defaultdict
from datetime import timedelta
from django.db import transaction
from django.db.models import Count
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.utils import timezone
from .models import JobCard, JobCardService, JobCardEmployee, JobCardPayment, JobCardProduct, JobCardProductUsage
from apps.customers.models import Customer, CustomerAsset
from .serializers import (
    JobCardSerializer,
    JobCardServiceSerializer,
    JobCardEmployeeSerializer,
    JobCardPaymentSerializer,
    FullJobCardCreateSerializer,
    ProductInfoSerializer,
    ProductsUsedSerializer,
    InventoryOptionSerializer,
    JobCardProductUsageReadSerializer,
    JobCardProductUsageCreateSerializer,
)
from apps.services.models import ServiceProduct
from apps.vendors.models import Inventory


# ─── JobCard ──────────────────────────────────────────

class FullJobCardCreateView(APIView):
    def post(self, request):
        serializer = FullJobCardCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        job_card = serializer.save()
        return Response(JobCardSerializer(job_card).data, status=status.HTTP_201_CREATED)


class JobCardListCreateView(APIView):
    def get(self, request):
        qs = JobCard.objects.all()
        job_status = request.query_params.get('status')
        date       = request.query_params.get('date')
        employee   = request.query_params.get('employee')
        company    = request.query_params.get('company')
        model      = request.query_params.get('model')
        vehicle_id = request.query_params.get('vehicle_id')
        if job_status:
            qs = qs.filter(job_card_status=job_status)
        if date:
            qs = qs.filter(job_card_date=date)
        if employee:
            qs = qs.filter(employee_id=employee)
        if company:
            qs = qs.filter(customer_asset__vehicle_company__icontains=company)
        if model:
            qs = qs.filter(customer_asset__vehicle_model__icontains=model)
        if vehicle_id:
            qs = qs.filter(customer_asset_id=vehicle_id)
        serializer = JobCardSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = JobCardSerializer(data=request.data)
        vehicle_number = serializer.vehicle_number
        customer_name = serializer.customer_name
        existing_vehicle = CustomerAsset.objects.filter(vehicle_number=vehicle_number).first()
        existing_customer = Customer.objects.filter(customer_name=customer_name).first()
        if existing_vehicle and serializer.is_valid():
            serializer.save(customer_asset=existing_vehicle)
            return Response(existing_vehicle, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class JobCardDetailView(APIView):
    def get_object(self, pk):
        try:
            return JobCard.objects.get(pk=pk)
        except JobCard.DoesNotExist:
            return None

    def get(self, request, pk):
        jobcard = self.get_object(pk)
        if not jobcard:
            return Response(
                {'error': 'Job card not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        serializer = JobCardSerializer(jobcard)
        return Response(serializer.data)

    def put(self, request, pk):
        jobcard = self.get_object(pk)

        if not jobcard:
            return Response(
                {'error': 'Job card not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        old_status = jobcard.job_card_status

        serializer = JobCardSerializer(jobcard, data=request.data, partial=True)
        if serializer.is_valid():
            updated_jobcard = serializer.save()
            print(serializer.data)

            if old_status != 'COMPLETED' and updated_jobcard.job_card_status == 'COMPLETED':
                updated_jobcard.vehicle_exit_time = timezone.now()
                updated_jobcard.save()
                vehicle = updated_jobcard.customer_asset
                updated_jobcard.job_card_services.update(service_status='completed')
                if vehicle:
                    today = timezone.now().date()
                    vehicle.last_service_date = today
                    vehicle.next_service_date = today + timedelta(days=183)  # ~6 months
                    vehicle.save(update_fields=['last_service_date', 'next_service_date'])

            return Response(JobCardSerializer(updated_jobcard).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        jobcard = self.get_object(pk)
        if not jobcard:
            return Response(
                {'error': 'Job card not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        jobcard.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── JobCard Service ──────────────────────────────────

class JobCardServiceListCreateView(APIView):
    def get(self, request, jobcard_pk):
        services = JobCardService.objects.filter(job_card_id=jobcard_pk)
        serializer = JobCardServiceSerializer(services, many=True)
        return Response(serializer.data)

    def post(self, request, jobcard_pk):
        try:
            jobcard = JobCard.objects.get(pk=jobcard_pk)
        except JobCard.DoesNotExist:
            return Response(
                {'error': 'Job card not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        if jobcard.job_card_status == 'COMPLETED':
            return Response(
                {'error': 'Cannot add service to completed job card'},
                status=status.HTTP_400_BAD_REQUEST
            )

        data = request.data.copy()
        data['job_card'] = jobcard.id

        # Auto set price_at_time using vehicle-specific pricing when available
        if 'price_at_time' not in data:
            try:
                from apps.services.models import Service, ServiceVehiclePrice
                service = Service.objects.get(pk=data['service'])
                price = service.service_price
                vehicle_type = jobcard.customer_asset.vehicle_type
                vehicle_sub_type = jobcard.vehicle_sub_type
                if vehicle_type == 'four_wheeler' and vehicle_sub_type:
                    effective_type = vehicle_sub_type
                elif vehicle_type == 'two_wheeler':
                    effective_type = 'two_wheeler'
                else:
                    effective_type = None
                if effective_type:
                    try:
                        vp = ServiceVehiclePrice.objects.get(service=service, vehicle_type=effective_type)
                        price = vp.price
                    except ServiceVehiclePrice.DoesNotExist:
                        pass
                data['price_at_time'] = price
            except Exception:
                pass

        serializer = JobCardServiceSerializer(data=data)
        if serializer.is_valid():
            jc_service = serializer.save()
            JobCardProduct.objects.bulk_create([
                JobCardProduct(job_card_service=jc_service, service_product=sp)
                for sp in ServiceProduct.objects.filter(service=jc_service.service)
            ])
            self.update_total_price(jobcard)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def update_total_price(self, jobcard):
        total = sum(
            s.price_at_time for s in jobcard.job_card_services.all()
        )
        jobcard.total_price = total
        jobcard.save()


class JobCardServiceDeleteView(APIView):
    def patch(self, request, pk):
        try:
            jc_service = JobCardService.objects.get(pk=pk)
            print (jc_service.service_status)
        except JobCardService.DoesNotExist:
            return Response(
                {'error': 'Not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        serializer = JobCardServiceSerializer(jc_service, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(serializer.data)
    
    def delete(self, request, pk):
        try:
            jc_service = JobCardService.objects.get(pk=pk)
        except JobCardService.DoesNotExist:
            return Response(
                {'error': 'Not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        jobcard = jc_service.job_card
        jc_service.delete()
        total = sum(
            s.price_at_time for s in jobcard.job_card_services.all()
        )
        jobcard.total_price = total
        jobcard.save()
        return Response(status=status.HTTP_204_NO_CONTENT)




# ─── JobCard Employee ─────────────────────────────────

class JobCardEmployeeListCreateView(APIView):
    def get(self, request, jcservice_pk):
        employees = JobCardEmployee.objects.filter(
            job_card_service_id=jcservice_pk
        )
        serializer = JobCardEmployeeSerializer(employees, many=True)
        return Response(serializer.data)

    def post(self, request, jcservice_pk):
        try:
            jc_service = JobCardService.objects.get(pk=jcservice_pk)
        except JobCardService.DoesNotExist:
            return Response(
                {'error': 'Job card service not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        data = request.data.copy()
        data['job_card_service'] = jc_service.id
        serializer = JobCardEmployeeSerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class JobCardEmployeeDeleteView(APIView):
    def delete(self, request, pk):
        try:
            jce = JobCardEmployee.objects.get(pk=pk)
        except JobCardEmployee.DoesNotExist:
            return Response(
                {'error': 'Not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        jce.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

class FetchVehicleType(APIView):
    def get_object(self, vehicle_type):
        try:
            return JobCard.objects.filter(customer_asset__vehicle_type=vehicle_type)
        except JobCard.DoesNotExist:
            return None

    def get(self, request, vehicle_type):
        jobcards_count = self.get_object(vehicle_type).count()
        return Response({'vehicle_type': vehicle_type, 'count': jobcards_count})


# ─── JobCard Payments ─────────────────────────────────

class JobCardPaymentListCreateView(APIView):
    def get(self, request, jobcard_pk):
        try:
            jobcard = JobCard.objects.get(pk=jobcard_pk)
        except JobCard.DoesNotExist:
            return Response({'error': 'Job card not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = JobCardPaymentSerializer(jobcard.payments.all(), many=True)
        return Response(serializer.data)

    def post(self, request, jobcard_pk):
        try:
            jobcard = JobCard.objects.get(pk=jobcard_pk)
        except JobCard.DoesNotExist:
            return Response({'error': 'Job card not found'}, status=status.HTTP_404_NOT_FOUND)
        data = request.data.copy()
        data['job_card'] = jobcard.id
        serializer = JobCardPaymentSerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class JobCardPaymentDeleteView(APIView):
    def delete(self, request, pk):
        try:
            payment = JobCardPayment.objects.get(pk=pk)
        except JobCardPayment.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        payment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

class FetchVehicleTypeList(APIView):
    def get(self, request, vehicle_type):
        qs = JobCard.objects.filter(customer_asset__vehicle_type=vehicle_type)
        date     = request.query_params.get('date')
        company  = request.query_params.get('company')
        model    = request.query_params.get('model')
        employee = request.query_params.get('employee')
        if date:
            qs = qs.filter(job_card_date=date)
        if company:
            qs = qs.filter(customer_asset__vehicle_company__icontains=company)
        if model:
            qs = qs.filter(customer_asset__vehicle_model__icontains=model)
        if employee:
            qs = qs.filter(employee_id=employee)
        serializer = JobCardSerializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
class FetchProductsUsedForJobCard(APIView):
    def get_object(self, jobcard_pk):
        try:
            return JobCardService.objects.filter(job_card_id= jobcard_pk) # we get all the servieces for the job card and then we get all the products used for those services in the response 
        except JobCardService.DoesNotExist:
            return None
    def get(self, request, jobcard_pk):
        jobcard_services = self.get_object(jobcard_pk) # contains all the services for that job card
        serializer = ProductsUsedSerializer(jobcard_services, many=True) # we use the ProductsUsedSerializer to get the products used for each service in the job card

        return Response(serializer.data , status=status.HTTP_200_OK)


# ─── JobCardProduct: inventory options + usage records ──────

class JobCardProductInventoryOptionsView(APIView):
    """GET inventory rows the worker can pick from for this planned product."""

    def get(self, request, jc_product_id):
        try:
            jc_product = JobCardProduct.objects.select_related('service_product__product').get(pk=jc_product_id)
        except JobCardProduct.DoesNotExist:
            return Response({'error': 'JobCardProduct not found'}, status=status.HTTP_404_NOT_FOUND)

        inventory_rows = Inventory.objects.filter(
            product=jc_product.service_product.product
        ).select_related('product').order_by('brand', 'unit_amount')

        return Response(InventoryOptionSerializer(inventory_rows, many=True).data)


class JobCardProductUsageListCreateView(APIView):
    """GET existing usages for this planned product; POST a new usage (decrements inventory)."""

    def get(self, request, jc_product_id):
        usages = JobCardProductUsage.objects.filter(
            job_card_product_id=jc_product_id
        ).select_related('product__product')
        return Response(JobCardProductUsageReadSerializer(usages, many=True).data)

    def post(self, request, jc_product_id):
        try:
            jc_product = JobCardProduct.objects.select_related('service_product__product').get(pk=jc_product_id)
        except JobCardProduct.DoesNotExist:
            return Response({'error': 'JobCardProduct not found'}, status=status.HTTP_404_NOT_FOUND)

        serializer = JobCardProductUsageCreateSerializer(
            data=request.data,
            context={'jc_product': jc_product},
        )
        serializer.is_valid(raise_exception=True)
        usage = serializer.save()
        return Response(JobCardProductUsageReadSerializer(usage).data, status=status.HTTP_201_CREATED)


class JobCardProductUsageDeleteView(APIView):
    """DELETE a usage row and restore that quantity back to the inventory it came from."""

    @transaction.atomic
    def delete(self, request, pk):
        try:
            usage = JobCardProductUsage.objects.select_related('product').get(pk=pk)
        except JobCardProductUsage.DoesNotExist:
            return Response({'error': 'Usage not found'}, status=status.HTTP_404_NOT_FOUND)

        inv = usage.product  # FK to Inventory
        inv.quantity_available = inv.quantity_available + usage.quantity_used
        inv.save(update_fields=['quantity_available'])
        usage.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Customer / Vehicle Analytics ────────────────────────────────────────────

class CustomerAnalyticsView(APIView):
    """
    Returns aggregated analytics for the Customers / Vehicles dashboard:
      - top_by_revenue   : top 10 customers by total billed
      - top_by_visits    : top 10 customers by job card count
      - vehicle_type_dist: job card count per vehicle type
      - payment_dist     : count of paid / partial / unpaid job cards
      - monthly_trend    : last 6 months – job card count + revenue
    """
    def get(self, request):
        from decimal import Decimal

        # Fetch all job cards with their services and payments in one pass
        all_jcs = JobCard.objects.prefetch_related(
            'job_card_services', 'payments', 'customer_asset__customer'
        ).all()

        customer_revenue = defaultdict(lambda: {'name': '', 'revenue': Decimal('0'), 'visits': 0})
        vehicle_type_counts = defaultdict(int)
        pay_dist = {'paid': 0, 'partial': 0, 'unpaid': 0}
        monthly = defaultdict(lambda: {'count': 0, 'revenue': Decimal('0')})

        today = timezone.now().date()
        six_months_ago = today.replace(day=1)
        # Go back 6 months
        m, y = six_months_ago.month, six_months_ago.year
        for _ in range(5):
            m -= 1
            if m == 0:
                m = 12
                y -= 1
        from datetime import date as ddate
        cutoff = ddate(y, m, 1)

        for jc in all_jcs:
            # Financials
            total = sum(s.price_at_time for s in jc.job_card_services.all())
            paid  = sum(p.amount for p in jc.payments.all())

            # Customer aggregation
            cust = jc.customer_asset.customer
            key  = cust.id
            customer_revenue[key]['name']    = cust.customer_name
            customer_revenue[key]['revenue'] += total
            customer_revenue[key]['visits']  += 1

            # Vehicle type distribution
            vehicle_type_counts[jc.customer_asset.vehicle_type] += 1

            # Payment status
            if total <= 0 or paid == 0:
                pay_dist['unpaid'] += 1
            elif paid >= total:
                pay_dist['paid'] += 1
            else:
                pay_dist['partial'] += 1

            # Monthly trend (last 6 months)
            if jc.job_card_date >= cutoff:
                key_m = jc.job_card_date.strftime('%Y-%m')
                monthly[key_m]['count']   += 1
                monthly[key_m]['revenue'] += total

        # Sort and slice — top 5 with customer_id for clickable links
        def _enrich(items, limit=5):
            return [
                {'customer_id': cid, 'name': c['name'],
                 'revenue': float(c['revenue']), 'visits': c['visits']}
                for cid, c in items[:limit]
            ]

        by_rev   = sorted(customer_revenue.items(), key=lambda x: x[1]['revenue'], reverse=True)
        by_visit = sorted(customer_revenue.items(), key=lambda x: x[1]['visits'],  reverse=True)
        top_by_revenue = _enrich(by_rev)
        top_by_visits  = _enrich(by_visit)

        TYPE_LABEL = {
            'two_wheeler': 'Two Wheeler',
            'three_wheeler': 'Three Wheeler',
            'four_wheeler': 'Four Wheeler',
            'other': 'Other',
        }
        vehicle_type_dist = [
            {'type': k, 'label': TYPE_LABEL.get(k, k), 'count': v}
            for k, v in sorted(vehicle_type_counts.items(), key=lambda x: -x[1])
        ]

        # Fill all 6 months even if no data
        monthly_trend = []
        yr, mo = cutoff.year, cutoff.month
        for _ in range(6):
            key_m = f'{yr}-{mo:02d}'
            monthly_trend.append({
                'month': key_m,
                'count': monthly[key_m]['count'],
                'revenue': float(monthly[key_m]['revenue']),
            })
            mo += 1
            if mo > 12:
                mo = 1
                yr += 1

        return Response({
            'top_by_revenue':    top_by_revenue,
            'top_by_visits':     top_by_visits,
            'vehicle_type_dist': vehicle_type_dist,
            'payment_dist': [
                {'status': 'Paid',    'count': pay_dist['paid']},
                {'status': 'Partial', 'count': pay_dist['partial']},
                {'status': 'Unpaid',  'count': pay_dist['unpaid']},
            ],
            'monthly_trend': monthly_trend,
            # Lightweight tier lookup used by job card list and create form
            'tiers': {
                'high_value': [r['customer_id'] for r in top_by_revenue],
                'frequent':   [r['customer_id'] for r in top_by_visits],
            },
        })


class CustomerReportView(APIView):
    """
    Full customer activity report.
    Query params (date range — mutually exclusive, applied in priority order):
      last_days – integer: show stats for last N days from today
      month     – YYYY-MM: show stats for that calendar month
      year      – YYYY: show stats for that full year
      (none)    – all-time stats
      status    – 'active' | 'inactive' | '' (all)
    Response: { customers: [...], total: N, available_years: [...] }
    """
    def get(self, request):
        from decimal import Decimal
        from datetime import date as ddate, timedelta
        from calendar import monthrange
        from apps.customers.models import Customer

        status_filter = request.query_params.get('status',    '')
        year_filter   = request.query_params.get('year',      '')
        last_days_raw = request.query_params.get('last_days', '')
        month_raw     = request.query_params.get('month',     '')

        today     = ddate.today()
        threshold = today - timedelta(days=45)

        # ── Determine date range for visit/revenue stats ─────────────────
        date_from = None
        date_to   = None
        if last_days_raw:
            try:
                date_from = today - timedelta(days=int(last_days_raw))
            except ValueError:
                pass
        elif month_raw:
            try:
                y, m = int(month_raw[:4]), int(month_raw[5:7])
                date_from = ddate(y, m, 1)
                date_to   = ddate(y, m, monthrange(y, m)[1])
            except (ValueError, IndexError):
                pass
        elif year_filter:
            try:
                date_from = ddate(int(year_filter), 1, 1)
                date_to   = ddate(int(year_filter), 12, 31)
            except ValueError:
                pass

        has_date_filter = date_from is not None

        # ── Step 1: aggregate job-card stats per customer (bulk fetch) ─────
        all_jcs = JobCard.objects.select_related(
            'customer_asset__customer'
        ).prefetch_related('job_card_services').order_by()

        cust_map  = {}
        all_years = set()

        for jc in all_jcs:
            cust   = jc.customer_asset.customer
            cid    = cust.id
            jc_date = jc.job_card_date
            yr     = str(jc_date.year) if jc_date else 'unknown'
            all_years.add(yr)

            if cid not in cust_map:
                cust_map[cid] = {
                    'id':               cid,
                    'name':             cust.customer_name,
                    'all_dates':        [],
                    'filtered_visits':  0,
                    'filtered_revenue': Decimal('0'),
                }
            row = cust_map[cid]
            if jc_date:
                row['all_dates'].append(jc_date)

            # Check whether this job card falls inside the selected date range
            in_range = True
            if date_from and jc_date and jc_date < date_from:
                in_range = False
            if date_to   and jc_date and jc_date > date_to:
                in_range = False

            if in_range:
                row['filtered_visits']  += 1
                row['filtered_revenue'] += sum(s.price_at_time for s in jc.job_card_services.all())

        # ── Step 2: build report (include customers with 0 visits) ─────────
        all_customers = Customer.objects.all().order_by('customer_name')
        report = []

        for cust in all_customers:
            cid  = cust.id
            data = cust_map.get(cid)

            if data:
                last_visit = max(data['all_dates']) if data['all_dates'] else None
                visits     = data['filtered_visits']
                revenue    = float(data['filtered_revenue'])
            else:
                last_visit = None
                visits     = 0
                revenue    = 0.0

            # last_days / month filter: always hide customers with 0 visits in that range
            if (last_days_raw or month_raw) and visits == 0:
                continue
            # year filter: hide zero-visit customers only when status='active'
            elif year_filter and visits == 0 and status_filter == 'active':
                continue

            is_active = last_visit is not None and last_visit >= threshold

            if status_filter == 'active'   and not is_active: continue
            if status_filter == 'inactive' and     is_active: continue

            report.append({
                'customer_id':     cid,
                'customer_name':   cust.customer_name,
                'phone_number':    cust.phone_number,
                'email':           cust.email or '',
                'total_visits':    visits,
                'last_visit_date': last_visit.isoformat() if last_visit else None,
                'total_revenue':   revenue,
                'is_active':       is_active,
            })

        report.sort(key=lambda x: x['last_visit_date'] or '', reverse=True)

        available_years = sorted(
            [y for y in all_years if y.isdigit()],
            reverse=True,
        )

        return Response({
            'customers':       report,
            'total':           len(report),
            'available_years': available_years,
        })


class CustomerTiersView(APIView):
    """Lightweight endpoint — returns only the top-5 customer IDs for each tier."""
    def get(self, _request):
        from decimal import Decimal
        all_jcs = JobCard.objects.prefetch_related(
            'job_card_services', 'payments', 'customer_asset__customer'
        ).all()
        revenue_map = defaultdict(lambda: {'revenue': Decimal('0'), 'visits': 0})
        for jc in all_jcs:
            cid   = jc.customer_asset.customer_id
            total = sum(s.price_at_time for s in jc.job_card_services.all())
            revenue_map[cid]['revenue'] += total
            revenue_map[cid]['visits']  += 1
        by_rev   = sorted(revenue_map.items(), key=lambda x: x[1]['revenue'], reverse=True)[:5]
        by_visit = sorted(revenue_map.items(), key=lambda x: x[1]['visits'],  reverse=True)[:5]
        return Response({
            'high_value': [{'id': cid, 'revenue': float(v['revenue']), 'visits': v['visits']} for cid, v in by_rev],
            'frequent':   [{'id': cid, 'revenue': float(v['revenue']), 'visits': v['visits']} for cid, v in by_visit],
        })