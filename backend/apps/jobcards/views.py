from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.utils import timezone
from .models import JobCard, JobCardService, JobCardEmployee, JobCardPayment
from apps.customers.models import Customer, CustomerAsset
from .serializers import (
    JobCardSerializer,
    JobCardServiceSerializer,
    JobCardEmployeeSerializer,
    JobCardPaymentSerializer,
    FullJobCardCreateSerializer,
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
        job_status = request.query_params.get('status', None)
        if job_status:
            jobcards = JobCard.objects.filter(job_card_status=job_status)
        else:
            jobcards = JobCard.objects.all()
        serializer = JobCardSerializer(jobcards, many=True)
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

            # ── Stock deduction when marked COMPLETED ──
            if old_status != 'COMPLETED' and updated_jobcard.job_card_status == 'COMPLETED':
                updated_jobcard.vehicle_exit_time = timezone.now()
                updated_jobcard.save()

                vehicle = updated_jobcard.customer_asset
                if vehicle:
                    vehicle.last_service_date = timezone.now().date()
                    vehicle.save(update_fields=['last_service_date'])

                self.deduct_inventory(updated_jobcard)

            return Response(JobCardSerializer(updated_jobcard).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def deduct_inventory(self, jobcard):
        for jc_service in jobcard.job_card_services.all():
            service_products = ServiceProduct.objects.filter(
                service=jc_service.service
            )
            for sp in service_products:
                try:
                    inventory = Inventory.objects.get(product=sp.product)
                    inventory.quantity_available -= sp.quantity_required
                    if inventory.quantity_available < 0:
                        inventory.quantity_available = 0
                    inventory.save()
                except Inventory.DoesNotExist:
                    pass

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

        # Auto set price_at_time from service's current price
        if 'price_at_time' not in data:
            try:
                from apps.services.models import Service
                service = Service.objects.get(pk=data['service'])
                data['price_at_time'] = service.service_price
            except Exception:
                pass

        serializer = JobCardServiceSerializer(data=data)
        if serializer.is_valid():
            serializer.save()
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
    