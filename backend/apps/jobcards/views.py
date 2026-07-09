import logging
from datetime import timedelta, date as _date
from decimal import Decimal
from urllib import request
from xml.parsers.expat import model
from django.db import transaction
from django.db.models import Count, Sum, Q, F
from django.db.models.functions import Coalesce
from apps.jobcards.utils import recalculate_total, compute_gst_split, recompute_payment_gst
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.utils import timezone
from django.db import connection
logger = logging.getLogger(__name__)
from .models import JobCard, JobCardService, JobCardEmployee, JobCardPayment, JobCardProduct, JobCardProductUsage, JobCardSalesProduct, SalesOrder
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
    JobCardSalesProductSerializer,
    JobCardSalesProductCreateSerializer,
    SalesInventorySerializer,
    SalesOrderSerializer,
    SalesOrderCreateSerializer,
)
from apps.services.models import ServiceProduct
from apps.vendors.models import Inventory
import time

# ─── JobCard ──────────────────────────────────────────

class FullJobCardCreateView(APIView):
    def post(self, request):
        owner_type = 'garage' if request.data.get('garage_owner') else 'customer'
        logger.info("Job card create requested | owner_type=%s", owner_type)

        serializer = FullJobCardCreateSerializer(data=request.data)
        if not serializer.is_valid():
            logger.warning("Job card create validation failed | owner_type=%s errors=%s",
                           owner_type, serializer.errors)
            serializer.is_valid(raise_exception=True)
        job_card = serializer.save()

        logger.info(
            "Job card created | id=%s number=%s owner_type=%s total=%s",
            job_card.id, job_card.job_card_number, owner_type, job_card.total_amount,
        )

        try:
            from apps.notifications.utils import queue_notification, _get_business_name
            if job_card.garage_owner:
                recipient_name = job_card.garage_owner.name
                phone          = job_card.garage_owner.phone_number
            else:
                customer       = job_card.customer_asset.customer 
                recipient_name = customer.customer_name or "Unknown Person"
                phone          = customer.phone_number
            queue_notification(
                recipient_name=recipient_name,
                phone=phone,
                trigger_type='job_checkin',
                vehicle_number=job_card.customer_asset.vehicle_number,
                business_name=_get_business_name(),
                job_card_number=job_card.job_card_number,
            )
            logger.info("Job card check-in notification queued | number=%s phone=%s",
                        job_card.job_card_number, phone)
        except Exception:
            logger.exception("job_checkin notification failed for job card %s", job_card.job_card_number)

        return Response(JobCardSerializer(job_card).data, status=status.HTTP_201_CREATED)


class JobCardListCreateView(APIView):
    def get(self, request):

        start = time.time()
        job_status = request.query_params.get('status')
        date_param = request.query_params.get('date')
        employee   = request.query_params.get('employee')
        company    = request.query_params.get('company')
        model      = request.query_params.get('model')
        vehicle_id = request.query_params.get('vehicle_id')
        owner_type = request.query_params.get('owner_type')
        date_from  = request.query_params.get('date_from')
        date_to    = request.query_params.get('date_to')

        qs = JobCard.objects.select_related(
            'customer_asset',
            'employee',
            'garage_owner',
            'customer',
        ).prefetch_related(
            'job_card_services__service',
            'job_card_services__employees__employee',
            'job_card_services__products__usages',
            'payments',
            'sales_products__inventory__product__product_type',
        )

        if not date_param and not date_from and not date_to:
            qs = qs.filter(
                job_card_date__gte=_date.today() - timedelta(days=7),
                job_card_date__lte=_date.today(),
            )

        if job_status:
            qs = qs.filter(job_card_status=job_status)
        if date_param:
            qs = qs.filter(job_card_date=date_param)
        if date_from:
            qs = qs.filter(job_card_date__gte=date_from)
        if date_to:
            qs = qs.filter(job_card_date__lte=date_to)
        if employee:
            qs = qs.filter(employee_id=employee)
        if company:
            qs = qs.filter(customer_asset__vehicle_company__icontains=company)
        if model:
            qs = qs.filter(customer_asset__vehicle_model__icontains=model)
        if vehicle_id:
            qs = qs.filter(customer_asset_id=vehicle_id)
        if owner_type == 'customer':
            qs = qs.filter(garage_owner__isnull=True)
        elif owner_type == 'garage':
            qs = qs.filter(garage_owner__isnull=False)

        serializer = JobCardSerializer(qs, many=True)
        print(f"Serialization took: {time.time() - start:.3f} seconds, queries: {len(connection.queries)}")
        return Response(serializer.data)



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
        logger.info("Job card update requested | number=%s old_status=%s",
                    jobcard.job_card_number, old_status)

        serializer = JobCardSerializer(jobcard, data=request.data, partial=True)
        if serializer.is_valid():
            updated_jobcard = serializer.save()
            if old_status != updated_jobcard.job_card_status:
                logger.info("Job card status toggled | number=%s %s -> %s",
                            updated_jobcard.job_card_number, old_status,
                            updated_jobcard.job_card_status)
            else:
                logger.info("Job card updated | number=%s status=%s total=%s",
                            updated_jobcard.job_card_number,
                            updated_jobcard.job_card_status, updated_jobcard.total_amount)
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

                try:
                    from apps.notifications.utils import queue_notification, _get_business_name
                    total = sum(s.price_at_time for s in updated_jobcard.job_card_services.all())
                    if updated_jobcard.garage_owner:
                        recipient_name = updated_jobcard.garage_owner.name
                        phone          = updated_jobcard.garage_owner.phone_number
                    else:
                        customer       = updated_jobcard.customer_asset.customer
                        recipient_name = customer.customer_name
                        phone          = customer.phone_number
                    queue_notification(
                        recipient_name=recipient_name,
                        phone=phone,
                        trigger_type='job_completed',
                        vehicle_number=updated_jobcard.customer_asset.vehicle_number,
                        business_name=_get_business_name(),
                        job_card_number=updated_jobcard.job_card_number,
                        total_amount=f"{total:,.2f}",
                    )
                except Exception:
                    logger.exception("job_completed notification failed for job card %s", updated_jobcard.job_card_number)

                # If this is a garage job card, check whether ALL garage cards are now done
                if updated_jobcard.garage_owner:
                    try:
                        from apps.notifications.utils import queue_notification, _get_business_name
                        pending_count = JobCard.objects.filter(
                            garage_owner=updated_jobcard.garage_owner
                        ).exclude(job_card_status='COMPLETED').count()
                        if pending_count == 0:
                            total_count = JobCard.objects.filter(
                                garage_owner=updated_jobcard.garage_owner
                            ).count()
                            go = updated_jobcard.garage_owner
                            queue_notification(
                                recipient_name=go.name,
                                phone=go.phone_number,
                                trigger_type='garage_all_completed',
                                garage_name=go.garage_name,
                                count=total_count,
                                business_name=_get_business_name(),
                            )
                    except Exception:
                        logger.exception(
                            "garage_all_completed notification failed for garage %s",
                            updated_jobcard.garage_owner_id,
                        )

            return Response(JobCardSerializer(updated_jobcard).data)
        logger.warning("Job card update validation failed | number=%s errors=%s",
                       jobcard.job_card_number, serializer.errors)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        jobcard = self.get_object(pk)
        if not jobcard:
            return Response(
                {'error': 'Job card not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        logger.info("Job card deleted | id=%s number=%s", jobcard.id, jobcard.job_card_number)
        jobcard.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── JobCard Service ──────────────────────────────────

class JobCardServiceListCreateView(APIView):
    def get(self, request, jobcard_pk):
        services = JobCardService.objects.filter(job_card_id=jobcard_pk)
        serializer = JobCardServiceSerializer(services, many=True)
        return Response(serializer.data)

    def post(self, request, jobcard_pk):
        logger.info("Add service to job card requested | jobcard_id=%s service=%s",
                    jobcard_pk, request.data.get('service'))
        try:
            jobcard = JobCard.objects.get(pk=jobcard_pk)
        except JobCard.DoesNotExist:
            logger.warning("Add service failed: job card not found | jobcard_id=%s", jobcard_pk)
            return Response(
                {'error': 'Job card not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        if jobcard.job_card_status == 'COMPLETED':
            logger.warning("Add service rejected: job card completed | number=%s service=%s",
                           jobcard.job_card_number, request.data.get('service'))
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
                logger.exception("Failed to resolve vehicle price for job card %s service %s; "
                                 "falling back to serializer default", jobcard_pk, data.get('service'))

        serializer = JobCardServiceSerializer(data=data)
        if serializer.is_valid():
            jc_service = serializer.save()
            products = JobCardProduct.objects.bulk_create([
                JobCardProduct(job_card_service=jc_service, service_product=sp)
                for sp in ServiceProduct.objects.filter(service=jc_service.service)
            ])
            recalculate_total(jobcard)
            logger.info("Service added to job card | jobcard=%s service_id=%s price=%s products_linked=%s",
                        jobcard.job_card_number, jc_service.service_id,
                        jc_service.price_at_time, len(products))
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        logger.warning("Add service validation failed | jobcard=%s errors=%s",
                       jobcard.job_card_number, serializer.errors)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class JobCardServiceDeleteView(APIView):
    def patch(self, request, pk):
        try:
            jc_service = JobCardService.objects.get(pk=pk)
        except JobCardService.DoesNotExist:
            return Response(
                {'error': 'Not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        old_status = jc_service.service_status
        serializer = JobCardServiceSerializer(jc_service, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        if old_status != updated.service_status:
            logger.info("Job card service toggled | jobcard=%s service=%s %s -> %s",
                        updated.job_card.job_card_number, updated.service_id,
                        old_status, updated.service_status)

        if old_status != 'completed' and updated.service_status == 'completed':
            try:
                from apps.notifications.utils import queue_notification, _get_business_name
                jc = updated.job_card
                remaining_count = jc.job_card_services.exclude(service_status='completed').count()
                if jc.garage_owner:
                    recipient_name = jc.garage_owner.name
                    phone          = jc.garage_owner.phone_number
                else:
                    customer       = jc.customer_asset.customer
                    recipient_name = customer.customer_name
                    phone          = customer.phone_number
                queue_notification(
                    recipient_name=recipient_name,
                    phone=phone,
                    trigger_type='service_complete',
                    service_name=updated.service.service_name,
                    vehicle_number=jc.customer_asset.vehicle_number,
                    time=timezone.localtime().strftime('%I:%M %p'),
                    remaining_count=remaining_count,
                    business_name=_get_business_name(),
                )
            except Exception:
                logger.exception("service_complete notification failed for jc_service %s", updated.pk)

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
        recalculate_total(jobcard)
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
            logger.warning("Job card payment failed: job card not found | jobcard_id=%s", jobcard_pk)
            return Response({'error': 'Job card not found'}, status=status.HTTP_404_NOT_FOUND)
        data = request.data.copy()
        data['job_card'] = jobcard.id
        logger.info("Job card payment requested | number=%s amount=%s method=%s",
                    jobcard.job_card_number, data.get('amount'), data.get('payment_method'))
        serializer = JobCardPaymentSerializer(data=data)
        if serializer.is_valid():
            amount = Decimal(str(data.get('amount', '0')))
            gst_col, base_col = compute_gst_split(jobcard, amount)
            payment = serializer.save(gst_collected=gst_col, base_collected=base_col)
            logger.info("Job card payment recorded | number=%s amount=%s method=%s",
                        jobcard.job_card_number, payment.amount, payment.payment_method)

            try:
                from apps.notifications.utils import queue_notification, _get_business_name
                jc    = payment.job_card
                total = sum(s.price_at_time for s in jc.job_card_services.all())
                paid  = sum(p.amount for p in jc.payments.all())
                balance = max(total - paid, 0)
                if jc.garage_owner:
                    recipient_name = jc.garage_owner.name
                    phone          = jc.garage_owner.phone_number
                else:
                    customer       = jc.customer_asset.customer
                    recipient_name = customer.customer_name
                    phone          = customer.phone_number
                queue_notification(
                    recipient_name=recipient_name or "Customer",
                    phone=phone,
                    trigger_type='payment_received',
                    amount=f"{payment.amount:,.2f}",
                    job_card_number=jc.job_card_number,
                    vehicle_number=jc.customer_asset.vehicle_number,
                    balance=f"{balance:,.2f}",
                    business_name=_get_business_name(),
                )
            except Exception:
                logger.exception("payment_received notification failed for job card %s", jobcard.job_card_number)

            return Response(serializer.data, status=status.HTTP_201_CREATED)
        logger.warning("Job card payment validation failed | number=%s errors=%s",
                       jobcard.job_card_number, serializer.errors)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class JobCardPaymentDeleteView(APIView):
    def delete(self, request, pk):
        try:
            payment = JobCardPayment.objects.select_related('job_card').get(pk=pk)
        except JobCardPayment.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        job_card = payment.job_card
        payment.delete()
        recompute_payment_gst(job_card)
        return Response(status=status.HTTP_204_NO_CONTENT)

class FetchVehicleTypeList(APIView):
    def get(self, request, vehicle_type):
        date       = request.query_params.get('date')
        company    = request.query_params.get('company')
        model      = request.query_params.get('model')
        employee   = request.query_params.get('employee')
        job_status = request.query_params.get('status')
        owner_type = request.query_params.get('owner_type')
        qs = JobCard.objects.select_related(
            'customer_asset__customer',
            'employee',
            'garage_owner',
        ).prefetch_related(
            'job_card_services__service',
            'job_card_services__employees__employee',
            'job_card_services__products__usages',
            'payments',
            'sales_products__inventory__product__product_type',
        ).filter(customer_asset__vehicle_type=vehicle_type)
        if request.GET:
            if date:
                qs = qs.filter(job_card_date=date)
            if company:
                qs = qs.filter(customer_asset__vehicle_company__icontains=company)
            if model:
                qs = qs.filter(customer_asset__vehicle_model__icontains=model)
            if employee:
                qs = qs.filter(employee_id=employee)
            if job_status:
                qs = qs.filter(job_card_status=job_status)
            if owner_type == 'customer':
                qs = qs.filter(garage_owner__isnull=True)
            elif owner_type == 'garage':
                qs = qs.filter(garage_owner__isnull=False)
        else:
            qs = qs.filter(job_card_date__lte= _date.today(),job_card_date__gte = _date.today()-timedelta(days = 7))
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
    Returns aggregated analytics for the Customers / Vehicles dashboard.
    Uses DB-level GROUP BY queries — no Python loops over job cards.
    """
    def get(self, request):
        from django.db.models import Sum, Count
        from django.db.models.functions import TruncMonth
        from datetime import date as ddate

        today = timezone.now().date()
        six_months_ago = today.replace(day=1)
        m, y = six_months_ago.month, six_months_ago.year
        for _ in range(5):
            m -= 1
            if m == 0:
                m = 12
                y -= 1
        cutoff = ddate(y, m, 1)

        # Query 1: revenue + visits per customer (one GROUP BY)
        cust_agg = list(
            JobCard.objects
            .values('customer_asset__customer_id', 'customer_asset__customer__customer_name', 'customer_asset__customer__phone_number',)
            .annotate(revenue=Sum('total_amount'), visits=Count('id'))
            .order_by()
        )

        by_rev = sorted(cust_agg, key=lambda x: float(x['revenue'] or 0), reverse=True)
        by_vis = sorted(cust_agg, key=lambda x: x['visits'], reverse=True)

        def _enrich(rows, limit=5):
            return [
                {
                    'customer_id': r['customer_asset__customer_id'],
                    'name': r['customer_asset__customer__customer_name'],
                    'phone_number': r['customer_asset__customer__phone_number'],
                    'revenue': float(r['revenue'] or 0),
                    'visits': r['visits'],
                }
                for r in rows[:limit]
            ]

        top_by_revenue = _enrich(by_rev)
        top_by_visits  = _enrich(by_vis)

        # Query 2: vehicle type distribution
        TYPE_LABEL = {
            'two_wheeler':   'Two Wheeler',
            'three_wheeler': 'Three Wheeler',
            'four_wheeler':  'Four Wheeler',
            'other':         'Other',
        }
        vtype_agg = (
            JobCard.objects
            .values('customer_asset__vehicle_type')
            .annotate(count=Count('id'))
            .order_by('-count')
        )
        vehicle_type_dist = [
            {
                'type':  r['customer_asset__vehicle_type'],
                'label': TYPE_LABEL.get(r['customer_asset__vehicle_type'], r['customer_asset__vehicle_type']),
                'count': r['count'],
            }
            for r in vtype_agg
        ]

        # Query 3: payment status distribution (paid / partial / unpaid)
        pay_rows = (
            JobCard.objects
            .annotate(paid_sum=Sum('payments__amount'))
            .values('total_amount', 'paid_sum')
        )
        pay_dist = {'paid': 0, 'partial': 0, 'unpaid': 0}
        for row in pay_rows:
            total = float(row['total_amount'] or 0)
            paid  = float(row['paid_sum'] or 0)
            if total <= 0 or paid == 0:
                pay_dist['unpaid'] += 1
            elif paid >= total:
                pay_dist['paid'] += 1
            else:
                pay_dist['partial'] += 1

        # Query 4: monthly trend (last 6 months)
        monthly_agg = (
            JobCard.objects
            .filter(job_card_date__gte=cutoff)
            .annotate(month=TruncMonth('job_card_date'))
            .values('month')
            .annotate(count=Count('id'), revenue=Sum('total_amount'))
            .order_by('month')
        )
        monthly_map = {
            r['month'].strftime('%Y-%m'): {'count': r['count'], 'revenue': float(r['revenue'] or 0)}
            for r in monthly_agg
        }
        monthly_trend = []
        yr, mo = cutoff.year, cutoff.month
        for _ in range(6):
            key_m = f'{yr}-{mo:02d}'
            d = monthly_map.get(key_m, {})
            monthly_trend.append({'month': key_m, 'count': d.get('count', 0), 'revenue': d.get('revenue', 0.0)})
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
            'monthly_trend':     monthly_trend,
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
        from django.db.models import Sum, Count, Max
        from django.db.models.functions import ExtractYear
        from datetime import date as ddate, timedelta
        from calendar import monthrange
        from apps.customers.models import Customer

        status_filter = request.query_params.get('status',    '')
        year_filter   = request.query_params.get('year',      '')
        last_days_raw = request.query_params.get('last_days', '')
        month_raw     = request.query_params.get('month',     '')

        today     = ddate.today()
        threshold = today - timedelta(days=45)

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

        # Query 1: all-time last visit per customer (for is_active check)
        last_visit_map = {
            r['customer_asset__customer_id']: r['last_visit']
            for r in JobCard.objects
                .values('customer_asset__customer_id')
                .annotate(last_visit=Max('job_card_date'))
        }

        # Query 2: filtered visits + revenue per customer
        filtered_qs = JobCard.objects.values('customer_asset__customer_id')
        if date_from:
            filtered_qs = filtered_qs.filter(job_card_date__gte=date_from)
        if date_to:
            filtered_qs = filtered_qs.filter(job_card_date__lte=date_to)
        filtered_map = {
            r['customer_asset__customer_id']: r
            for r in filtered_qs.annotate(visits=Count('id'), revenue=Sum('total_amount'))
        }

        # Query 3: distinct years present in job cards
        available_years = [
            str(y) for y in
            JobCard.objects
            .annotate(yr=ExtractYear('job_card_date'))
            .values_list('yr', flat=True)
            .distinct()
            .order_by('-yr')
            if y is not None
        ]

        all_customers = Customer.objects.all().order_by('customer_name')
        report = []

        for cust in all_customers:
            cid = cust.id
            agg = filtered_map.get(cid, {})
            visits     = agg.get('visits', 0) or 0
            revenue    = float(agg.get('revenue') or 0)
            last_visit = last_visit_map.get(cid)

            if (last_days_raw or month_raw) and visits == 0:
                continue
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

        return Response({
            'customers':       report,
            'total':           len(report),
            'available_years': available_years,
        })


class CustomerTiersView(APIView):
    """Lightweight endpoint — returns only the top-5 customer IDs for each tier."""
    def get(self, _request):
        from django.db.models import Sum, Count

        cust_agg = list(
            JobCard.objects
            .values('customer_asset__customer_id')
            .annotate(revenue=Sum('total_amount'), visits=Count('id'))
            .order_by()
        )

        by_rev   = sorted(cust_agg, key=lambda x: float(x['revenue'] or 0), reverse=True)[:5]
        by_visit = sorted(cust_agg, key=lambda x: x['visits'], reverse=True)[:5]

        def _fmt(rows):
            return [
                {'id': r['customer_asset__customer_id'], 'revenue': float(r['revenue'] or 0), 'visits': r['visits']}
                for r in rows
            ]

        return Response({'high_value': _fmt(by_rev), 'frequent': _fmt(by_visit)})


# ─── Sales Products ───────────────────────────────────────────────────────────

class SalesInventoryListView(APIView):
    """GET all inventory items whose product category is 'sales'."""
    def get(self, request):
        qs = Inventory.objects.filter(
            product__category='sales'
        ).select_related('product__product_type').order_by('product__product_name', 'brand')
        return Response(SalesInventorySerializer(qs, many=True).data)


class JobCardSalesProductListCreateView(APIView):
    def get(self, request, jobcard_pk):
        try:
            job_card = JobCard.objects.get(pk=jobcard_pk)
        except JobCard.DoesNotExist:
            return Response({'error': 'Job card not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(JobCardSalesProductSerializer(job_card.sales_products.all(), many=True).data)

    def post(self, request, jobcard_pk):
        try:
            job_card = JobCard.objects.get(pk=jobcard_pk)
        except JobCard.DoesNotExist:
            return Response({'error': 'Job card not found'}, status=status.HTTP_404_NOT_FOUND)

        if job_card.job_card_status == 'COMPLETED':
            return Response(
                {'error': 'Cannot add products to a completed job card'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = JobCardSalesProductCreateSerializer(
            data=request.data,
            context={'job_card': job_card},
        )
        serializer.is_valid(raise_exception=True)
        print(serializer)
        sp = serializer.save()
        recalculate_total(job_card)
        return Response(JobCardSalesProductSerializer(sp).data, status=status.HTTP_201_CREATED)


class JobCardSalesProductDeleteView(APIView):
    @transaction.atomic
    def delete(self, request, pk):
        try:
            sp = JobCardSalesProduct.objects.select_related('inventory').get(pk=pk)
        except JobCardSalesProduct.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        job_card = sp.job_card
        inv = sp.inventory
        inv.quantity_available += sp.quantity
        inv.save(update_fields=['quantity_available'])
        sp.delete()
        recalculate_total(job_card)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Standalone Sales ──────────────────────────────────────────────────────────

class SalesOrderListCreateView(APIView):
    def get(self, request):
        qs = SalesOrder.objects.prefetch_related(
            'items__inventory__product'
        ).order_by('-sale_date', '-created_at')
        search = request.query_params.get('search', '')
        date   = request.query_params.get('date', '')
        if request.GET:
            if search:
                from django.db.models import Q as DQ
                qs = qs.filter(
                    DQ(customer_name__icontains=search) |
                    DQ(phone_number__icontains=search) |
                    DQ(order_number__icontains=search)
                )
            if date:
                qs = qs.filter(sale_date=date)
        else:
            qs = qs.filter(sale_date__lte = _date.today(), sale_date__gte = _date.today()-timedelta(days=7))
        return Response(SalesOrderSerializer(qs, many=True).data)

    def post(self, request):
        item_count = len(request.data.get('items') or [])
        logger.info("Sales order create requested | customer=%s items=%s",
                    request.data.get('customer_name'), item_count)

        ser = SalesOrderCreateSerializer(data=request.data)
        if not ser.is_valid():
            logger.warning("Sales order create validation failed | errors=%s", ser.errors)
            ser.is_valid(raise_exception=True)
        order = ser.save()

        logger.info("Sales order created | id=%s number=%s customer=%s total=%s items=%s",
                    order.id, order.order_number, order.customer_name,
                    order.total_amount, item_count)
        return Response(SalesOrderSerializer(order).data, status=status.HTTP_201_CREATED)


class SalesOrderDeleteView(APIView):
    @transaction.atomic
    def delete(self, request, pk):
        try:
            order = SalesOrder.objects.prefetch_related('items__inventory').get(pk=pk)
        except SalesOrder.DoesNotExist:
            logger.warning("Sales order delete failed: not found | id=%s", pk)
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        restocked = 0
        for item in order.items.all():
            inv = item.inventory
            inv.quantity_available += item.quantity
            inv.save(update_fields=['quantity_available'])
            restocked += 1
        order_number = order.order_number
        order.delete()
        logger.info("Sales order deleted | id=%s number=%s items_restocked=%s",
                    pk, order_number, restocked)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SalesAnalyticsView(APIView):
    """
    Returns combined analytics + unified feed for the Sales dashboard.
    Combines data from SalesOrder (standalone) and JobCardSalesProduct (job-card-linked).
    """
    def get(self, request):
        from decimal import Decimal
        from collections import defaultdict

        # ── 1. Standalone sales ───────────────────────────────────────────
        standalone_product_map = defaultdict(lambda: {'quantity': Decimal('0'), 'revenue': Decimal('0'), 'brand': ''})
        standalone_customer_map = defaultdict(lambda: {'name': '', 'phone': '', 'spent': Decimal('0'), 'count': 0})
        standalone_revenue = Decimal('0')
        standalone_count   = 0

        standalone_orders = SalesOrder.objects.prefetch_related('items__inventory__product').order_by('-sale_date', '-created_at').filter(sale_date__lte = _date.today(), sale_date__gte = _date.today()-timedelta(days=7))
        for order in standalone_orders:
            total = sum((it.unit_price * it.quantity for it in order.items.all()), Decimal('0'))
            standalone_revenue += total
            standalone_count   += 1
            key = order.customer_name.strip().lower()
            standalone_customer_map[key]['name']  = order.customer_name
            standalone_customer_map[key]['phone'] = order.phone_number
            standalone_customer_map[key]['spent'] += total
            standalone_customer_map[key]['count'] += 1
            for it in order.items.all():
                pkey = f"{it.inventory.product.product_name}|{it.inventory.brand}"
                standalone_product_map[pkey]['quantity'] += it.quantity
                standalone_product_map[pkey]['revenue']  += it.unit_price * it.quantity
                standalone_product_map[pkey]['brand']     = it.inventory.brand
                standalone_product_map[pkey]['name']      = it.inventory.product.product_name

        # ── 2. Job-card sales ─────────────────────────────────────────────
        start = timezone.now() - timedelta(days=7)
        end = timezone.now()
        jc_sales = JobCardSalesProduct.objects.select_related(
            'job_card__customer_asset__customer', 'inventory__product'
        ).filter(created_at__lte = start , created_at__gte = end)

        jc_product_map = defaultdict(lambda: {'quantity': Decimal('0'), 'revenue': Decimal('0'), 'brand': '', 'name': ''})
        jc_customer_map = defaultdict(lambda: {'name': '', 'phone': '', 'spent': Decimal('0'), 'count': 0, 'jc_nos': set()})
        jc_revenue = Decimal('0')

        for sp in jc_sales:
            line = sp.unit_price * sp.quantity
            jc_revenue += line
            pkey = f"{sp.inventory.product.product_name}|{sp.inventory.brand}"
            jc_product_map[pkey]['quantity'] += sp.quantity
            jc_product_map[pkey]['revenue']  += line
            jc_product_map[pkey]['brand']     = sp.inventory.brand
            jc_product_map[pkey]['name']      = sp.inventory.product.product_name
            cust = sp.job_card.customer_asset.customer
            ckey = cust.id
            jc_customer_map[ckey]['name']  = cust.customer_name
            jc_customer_map[ckey]['phone'] = cust.phone_number
            jc_customer_map[ckey]['spent'] += line
            jc_customer_map[ckey]['jc_nos'].add(sp.job_card_id)
        for v in jc_customer_map.values():
            v['count'] = len(v.pop('jc_nos'))

        jc_count = JobCardSalesProduct.objects.values('job_card').distinct().count()

        # ── 3. Combined product ranking ───────────────────────────────────
        combined = defaultdict(lambda: {'quantity': Decimal('0'), 'revenue': Decimal('0'), 'brand': '', 'name': ''})
        for pkey, v in {**standalone_product_map, **jc_product_map}.items():
            combined[pkey]['quantity'] += v['quantity']
            combined[pkey]['revenue']  += v['revenue']
            combined[pkey]['brand']     = v['brand']
            combined[pkey]['name']      = v['name']
        # Re-merge properly
        merged_products = {}
        for pkey, v in standalone_product_map.items():
            merged_products[pkey] = dict(v)
        for pkey, v in jc_product_map.items():
            if pkey in merged_products:
                merged_products[pkey]['quantity'] += v['quantity']
                merged_products[pkey]['revenue']  += v['revenue']
            else:
                merged_products[pkey] = dict(v)

        sorted_products = sorted(merged_products.values(), key=lambda x: x['revenue'], reverse=True)
        top_products    = sorted_products[:5]
        bottom_products = sorted(merged_products.values(), key=lambda x: x['revenue'])[:5]

        # ── 4. Combined customer ranking ──────────────────────────────────
        merged_customers = {}
        for k, v in standalone_customer_map.items():
            merged_customers[('standalone', k)] = {'name': v['name'], 'phone': v['phone'], 'spent': v['spent'], 'count': v['count']}
        for k, v in jc_customer_map.items():
            label = ('jc', k)
            if label in merged_customers:
                merged_customers[label]['spent'] += v['spent']
                merged_customers[label]['count'] += v['count']
            else:
                merged_customers[label] = {'name': v['name'], 'phone': v['phone'], 'spent': v['spent'], 'count': v['count']}
        top_customers = sorted(merged_customers.values(), key=lambda x: x['spent'], reverse=True)[:5]

        # ── 5. Feed (unified table rows) ──────────────────────────────────
        feed = []
        for order in standalone_orders:
            items_list = [
                {
                    'product_name': it.inventory.product.product_name,
                    'brand':        it.inventory.brand,
                    'quantity':     str(it.quantity),
                    'unit_price':   str(it.unit_price),
                    'unit':         it.inventory.product.product_unit,
                    'unit_amount':  str(it.inventory.unit_amount),
                    'line_total':   str((it.unit_price * it.quantity).quantize(Decimal('0.01'))),
                }
                for it in order.items.all()
            ]
            total = sum((Decimal(i['line_total']) for i in items_list), Decimal('0'))
            feed.append({
                'type':           'standalone',
                'id':             order.id,
                'order_number':   order.order_number,
                'date':           str(order.sale_date),
                'customer_name':  order.customer_name,
                'phone_number':   order.phone_number,
                'vehicle_number': None,
                'items':          items_list,
                'total_amount':   str(total.quantize(Decimal('0.01'))),
                'payment_method': order.payment_method,
                'notes':          order.notes,
                'share_token':    str(order.share_token),
            })

        # Job-card sales grouped by job card
        from collections import defaultdict as dd
        jc_grouped = dd(list)
        jc_meta    = {}
        for sp in jc_sales:
            jc = sp.job_card
            jc_grouped[jc.id].append(sp)
            if jc.id not in jc_meta:
                cust = jc.customer_asset.customer
                jc_meta[jc.id] = {
                    'job_card_number': jc.job_card_number,
                    'date':            str(jc.job_card_date),
                    'customer_name':   cust.customer_name,
                    'phone_number':    cust.phone_number,
                    'vehicle_number':  jc.customer_asset.vehicle_number,
                }
        for jc_id, sps in jc_grouped.items():
            items_list = [
                {
                    'product_name': sp.inventory.product.product_name,
                    'brand':        sp.inventory.brand,
                    'quantity':     str(sp.quantity),
                    'unit_price':   str(sp.unit_price),
                    'unit':         sp.inventory.product.product_unit,
                    'unit_amount':  str(sp.inventory.unit_amount),
                    'line_total':   str((sp.unit_price * sp.quantity).quantize(Decimal('0.01'))),
                }
                for sp in sps
            ]
            total = sum((Decimal(i['line_total']) for i in items_list), Decimal('0'))
            meta  = jc_meta[jc_id]
            feed.append({
                'type':           'job_card',
                'id':             jc_id,
                'order_number':   meta['job_card_number'],
                'date':           meta['date'],
                'customer_name':  meta['customer_name'],
                'phone_number':   meta['phone_number'],
                'vehicle_number': meta['vehicle_number'],
                'items':          items_list,
                'total_amount':   str(total.quantize(Decimal('0.01'))),
                'payment_method': None,
                'notes':          '',
            })

        feed.sort(key=lambda x: x['date'], reverse=True)

        total_revenue   = standalone_revenue + jc_revenue
        today_str = str(timezone.now().date())
        today_revenue   = sum(
            (Decimal(r['total_amount']) for r in feed if r['date'] == today_str),
            Decimal('0')
        )

        return Response({
            'analytics': {
                'total_revenue':      str(total_revenue.quantize(Decimal('0.01'))),
                'today_revenue':      str(today_revenue.quantize(Decimal('0.01'))),
                'standalone_count':   standalone_count,
                'jc_count':           jc_count,
                'top_products':       [
                    {'name': p['name'], 'brand': p['brand'],
                     'quantity': str(p['quantity']), 'revenue': str(p['revenue'].quantize(Decimal('0.01')))}
                    for p in top_products
                ],
                'bottom_products':    [
                    {'name': p['name'], 'brand': p['brand'],
                     'quantity': str(p['quantity']), 'revenue': str(p['revenue'].quantize(Decimal('0.01')))}
                    for p in bottom_products
                ],
                'top_customers':      [
                    {'name': c['name'], 'phone': c['phone'],
                     'spent': str(c['spent'].quantize(Decimal('0.01'))), 'count': c['count']}
                    for c in top_customers
                ],
                'sales_by_type': {
                    'standalone': {'count': standalone_count, 'revenue': str(standalone_revenue.quantize(Decimal('0.01')))},
                    'job_card':   {'count': jc_count,         'revenue': str(jc_revenue.quantize(Decimal('0.01')))},
                },
            },
            'feed': feed,
        })


# ─── Garage Job-Card Groups ────────────────────────────────────────────────────
# Returns all garage job cards grouped by garage owner.
# Each group carries per-garage totals (total, paid, outstanding, payment_status)
# plus a full list of serialized job cards.

class GarageJobCardGroupView(APIView):
    def get(self, request):
        qs = JobCard.objects.filter(garage_owner__isnull=False)
        job_status = request.query_params.get('status')
        date_str   = request.query_params.get('date')
        employee   = request.query_params.get('employee')
        garage_id  = request.query_params.get('garage_id')
        if job_status: qs = qs.filter(job_card_status=job_status)
        if date_str:   qs = qs.filter(job_card_date=date_str)
        if employee:   qs = qs.filter(employee_id=employee)
        if garage_id:  qs = qs.filter(garage_owner_id=garage_id)

        # Payment status isn't a DB column (it's a SerializerMethodField), so we
        # derive it here from the stored total_amount and the sum of payments —
        # mirroring JobCardSerializer.get_payment_status: a card is fully 'paid'
        # only when total_amount > 0 and payments cover it; otherwise it is
        # 'unpaid'/'partial'.
        cutoff = _date.today() - timedelta(days=7)
        qs = qs.annotate(_paid_sum=Coalesce(Sum('payments__amount'), Decimal('0')))
        fully_paid = Q(total_amount__gt=0) & Q(_paid_sum__gte=F('total_amount'))

        # Branch 1 — always include: unpaid/partial OR currently in progress.
        always_include = ~fully_paid | Q(job_card_status='IN_PROGRESS')
        # Branch 2 — include only within the last 7 days (by job_card_date):
        # fully paid AND completed.
        recent_paid = fully_paid & Q(job_card_status='COMPLETED') & Q(job_card_date__gte=cutoff)
        qs = qs.filter(always_include | recent_paid)

        qs = qs.select_related(
            'garage_owner', 'customer_asset', 'employee'
        ).prefetch_related(
            'payments', 'job_card_services__service', 'sales_products'
        ).order_by('garage_owner_id', 'job_card_date')

        serialized_list = JobCardSerializer(qs, many=True).data

        groups = {}
        for jc_data, jc_obj in zip(serialized_list, qs):
            g_id = jc_obj.garage_owner_id
            if g_id not in groups:
                go = jc_obj.garage_owner
                groups[g_id] = {
                    'garage_id':    g_id,
                    'garage_name':  go.garage_name,
                    'garage_phone': go.phone_number,
                    'garage_location': go.location or '',
                    'garage_gstin':    go.gstin or '',
                    'job_cards': [],
                }
            groups[g_id]['job_cards'].append(jc_data)

        result = []
        for group in groups.values():
            total = sum(Decimal(str(jc.get('total_amount') or '0')) for jc in group['job_cards'])
            paid  = sum(Decimal(str(jc.get('paid_amount')  or '0')) for jc in group['job_cards'])
            outstanding = total - paid
            completed   = sum(1 for jc in group['job_cards'] if jc.get('job_card_status') == 'COMPLETED')
            in_progress = len(group['job_cards']) - completed

            if total <= 0:
                pay_status = 'unpaid'
            elif paid >= total:
                pay_status = 'paid'
            elif paid > 0:
                pay_status = 'partial'
            else:
                pay_status = 'unpaid'

            result.append({
                **group,
                'total_amount':     str(total.quantize(Decimal('0.01'))),
                'paid_amount':      str(paid.quantize(Decimal('0.01'))),
                'outstanding':      str(outstanding.quantize(Decimal('0.01'))),
                'payment_status':   pay_status,
                'job_card_count':   len(group['job_cards']),
                'completed_count':  completed,
                'in_progress_count': in_progress,
            })

        result.sort(key=lambda g: g['garage_name'])
        return Response(result)


# ─── Garage Group Payment ──────────────────────────────────────────────────────
# Distributes a single payment amount across a garage's outstanding job cards
# (oldest first). Creates individual JobCardPayment records atomically.

class GaragePaymentView(APIView):
    @transaction.atomic
    def post(self, request):
        garage_id      = request.data.get('garage_id')
        try:
            amount     = Decimal(str(request.data.get('amount', '0')))
        except Exception:
            return Response({'error': 'Invalid amount'}, status=status.HTTP_400_BAD_REQUEST)
        payment_method = request.data.get('payment_method', 'cash')
        payment_date   = request.data.get('payment_date') or str(_date.today())
        notes          = request.data.get('notes', '')

        if not garage_id:
            return Response({'error': 'garage_id required'}, status=status.HTTP_400_BAD_REQUEST)
        if amount <= 0:
            return Response({'error': 'Amount must be greater than 0'}, status=status.HTTP_400_BAD_REQUEST)

        job_cards = list(
            JobCard.objects.filter(garage_owner_id=garage_id)
            .prefetch_related('payments', 'job_card_services', 'sales_products')
            .order_by('job_card_date', 'id')
        )

        remaining = amount
        payments_created = []

        for jc in job_cards:
            if remaining <= Decimal('0.00'):
                break
            svc_base_total = sum(s.price_at_time for s in jc.job_card_services.all())
            svc_total = Decimal('0')
            if jc.gst_percent>0:
                svc_total = svc_base_total + (jc.gst_percent/100)*svc_base_total
            else:
                svc_total = svc_base_total
            sales_total = sum(
                sp.unit_price * sp.quantity
                for sp in jc.sales_products.all()
            )
            paid_so_far = sum(p.amount for p in jc.payments.all())
            outstanding = (svc_total + sales_total) - paid_so_far

            if outstanding <= Decimal('0.00'):
                continue

            pay_this = min(remaining, outstanding)
            gst_col, base_col = compute_gst_split(jc, pay_this)
            JobCardPayment.objects.create(
                job_card=jc,
                amount=pay_this,
                gst_collected=gst_col,
                base_collected=base_col,
                payment_date=payment_date,
                payment_method=payment_method,
                notes=notes or 'Garage group payment',
            )
            payments_created.append({
                'job_card_id':     jc.id,
                'job_card_number': jc.job_card_number,
                'amount':          str(pay_this.quantize(Decimal('0.01'))),
                'outstanding_was': str(outstanding.quantize(Decimal('0.01'))),
            })
            remaining -= pay_this

        total_applied = amount - remaining
        if total_applied > 0:
            try:
                from apps.customers.models import GarageOwner
                from apps.notifications.utils import queue_notification, _get_business_name
                garage = GarageOwner.objects.get(pk=garage_id)
                queue_notification(
                    recipient_name=garage.name,
                    phone=garage.phone_number,
                    trigger_type='garage_payment',
                    garage_name=garage.garage_name,
                    amount=f"{total_applied:,.2f}",
                    business_name=_get_business_name(),
                )
            except Exception:
                logger.exception("garage_payment notification failed for garage %s", garage_id)

        return Response({
            'payments_created':  payments_created,
            'total_applied':     str(total_applied.quantize(Decimal('0.01'))),
            'remaining':         str(remaining.quantize(Decimal('0.01'))),
        }, status=status.HTTP_201_CREATED)

# ─── Public Invoice View (no auth) ────────────────────────────────────────────
class JobCardPublicInvoiceView(APIView):
    permission_classes    = [AllowAny]
    authentication_classes = []

    def get(self, request, share_token):
        try:
            jobcard = JobCard.objects.get(share_token=share_token)
        except JobCard.DoesNotExist:
            return Response({'error': 'Invoice not found'}, status=status.HTTP_404_NOT_FOUND)

        from apps.site_settings.models import Setting
        biz_keys = ['business_name', 'business_phone', 'business_address', 'business_gst_number']
        biz_map  = {s.field_name: s.value for s in Setting.objects.filter(field_name__in=biz_keys)}

        return Response({
            'job_card': JobCardSerializer(jobcard).data,
            'business': {
                'name':       biz_map.get('business_name',       ''),
                'phone':      biz_map.get('business_phone',      ''),
                'address':    biz_map.get('business_address',    ''),
                'gst_number': biz_map.get('business_gst_number', ''),
            },
        })


class SalesOrderPublicView(APIView):
    permission_classes    = [AllowAny]
    authentication_classes = []

    def get(self, request, share_token):
        try:
            order = SalesOrder.objects.prefetch_related('items__inventory__product').get(share_token=share_token)
        except SalesOrder.DoesNotExist:
            return Response({'error': 'Invoice not found'}, status=status.HTTP_404_NOT_FOUND)

        from apps.site_settings.models import Setting
        biz_keys = ['business_name', 'business_phone', 'business_address', 'business_gst_number']
        biz_map  = {s.field_name: s.value for s in Setting.objects.filter(field_name__in=biz_keys)}

        items_list = [
            {
                'product_name': it.inventory.product.product_name,
                'brand':        it.inventory.brand,
                'quantity':     str(it.quantity),
                'unit_price':   str(it.unit_price),
                'unit':         it.inventory.product.product_unit,
                'unit_amount':  str(it.inventory.unit_amount),
                'line_total':   str((it.unit_price * it.quantity).quantize(Decimal('0.01'))),
            }
            for it in order.items.all()
        ]
        total = sum((Decimal(i['line_total']) for i in items_list), Decimal('0'))

        return Response({
            'order': {
                'type':           'standalone',
                'id':             order.id,
                'order_number':   order.order_number,
                'date':           str(order.sale_date),
                'customer_name':  order.customer_name,
                'phone_number':   order.phone_number,
                'vehicle_number': None,
                'items':          items_list,
                'total_amount':   str(total.quantize(Decimal('0.01'))),
                'payment_method': order.payment_method,
                'notes':          order.notes,
            },
            'business': {
                'name':       biz_map.get('business_name',       ''),
                'phone':      biz_map.get('business_phone',      ''),
                'address':    biz_map.get('business_address',    ''),
                'gst_number': biz_map.get('business_gst_number', ''),
            },
        })
