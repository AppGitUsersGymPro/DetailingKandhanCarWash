import logging
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Service, ServiceProduct, ServiceEmployee, ServiceVehiclePrice
from .serializers import (
    ServiceSerializer,
    ServiceProductSerializer,
    ServiceEmployeeSerializer,
    ServiceVehiclePriceSerializer,
)

logger = logging.getLogger(__name__)


# ─── Service ──────────────────────────────────────────

class ServiceListCreateView(APIView):
    def get(self, request):
        name = request.query_params.get('name', None)
        if name:
            services = Service.objects.filter(service_name__icontains=name)
        else:
            services = Service.objects.all()
        serializer = ServiceSerializer(services, many=True)
        return Response(serializer.data)

    def post(self, request):
        logger.info("Service create requested | name=%s", request.data.get('service_name'))
        serializer = ServiceSerializer(data=request.data)
        if serializer.is_valid():
            service = serializer.save()
            logger.info("Service created | id=%s name=%s price=%s",
                        service.id, service.service_name, service.service_price)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        logger.warning("Service create validation failed | errors=%s", serializer.errors)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class ServiceListByVehicleTypeCreateView(APIView):
    def get(self,request, vehicle_type):
        if vehicle_type == "two_wheeler":
            services  = Service.objects.filter(two_wheeler_service = True)
        elif vehicle_type== "four_wheeler":
            services  = Service.objects.filter(four_wheeler_service = True)
        else:
            services  = Service.objects.filter(other_wheeler_service = True)
        serializer = ServiceSerializer(services,many = True)
        return Response(serializer.data)
        

class ServiceDetailView(APIView):
    def get_object(self, pk):
        try:
            return Service.objects.get(pk=pk)
        except Service.DoesNotExist:
            return None

    def get(self, request, pk):
        service = self.get_object(pk)
        if not service:
            return Response(
                {'error': 'Service not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        serializer = ServiceSerializer(service)
        return Response(serializer.data)

    def put(self, request, pk):
        service = self.get_object(pk)
        if not service:
            return Response(
                {'error': 'Service not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        serializer = ServiceSerializer(service, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        service = self.get_object(pk)
        if not service:
            return Response(
                {'error': 'Service not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        service.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Service Product ──────────────────────────────────

class ServiceProductListCreateView(APIView):
    def get(self, request, service_pk):
        products = ServiceProduct.objects.filter(service_id=service_pk)
        serializer = ServiceProductSerializer(products, many=True)
        return Response(serializer.data)

    def post(self, request, service_pk):
        try:
            service = Service.objects.get(pk=service_pk)
        except Service.DoesNotExist:
            return Response(
                {'error': 'Service not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        data = request.data.copy()
        data['service'] = service.id
        serializer = ServiceProductSerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ServiceProductDeleteView(APIView):
    def delete(self, request, pk):
        try:
            service_product = ServiceProduct.objects.get(pk=pk)
        except ServiceProduct.DoesNotExist:
            return Response(
                {'error': 'Not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        service_product.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Service Employee ─────────────────────────────────

class ServiceEmployeeListCreateView(APIView):
    def get(self, request, service_pk):
        employees = ServiceEmployee.objects.filter(service_id=service_pk)
        serializer = ServiceEmployeeSerializer(employees, many=True)
        return Response(serializer.data)

    def post(self, request, service_pk):
        try:
            service = Service.objects.get(pk=service_pk)
        except Service.DoesNotExist:
            return Response(
                {'error': 'Service not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        data = request.data.copy()
        data['service'] = service.id
        serializer = ServiceEmployeeSerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ServiceEmployeeDeleteView(APIView):
    def delete(self, request, pk):
        try:
            service_employee = ServiceEmployee.objects.get(pk=pk)
        except ServiceEmployee.DoesNotExist:
            return Response(
                {'error': 'Not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        service_employee.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Service Vehicle Prices ───────────────────────────

class ServiceVehiclePriceListCreateView(APIView):
    def get(self, request, service_pk):
        prices = ServiceVehiclePrice.objects.filter(service_id=service_pk)
        return Response(ServiceVehiclePriceSerializer(prices, many=True).data)

    def post(self, request, service_pk):
        try:
            service = Service.objects.get(pk=service_pk)
        except Service.DoesNotExist:
            return Response({'error': 'Service not found'}, status=status.HTTP_404_NOT_FOUND)

        vehicle_type = request.data.get('vehicle_type')
        price = request.data.get('price')

        # Upsert: update existing row or create new
        instance, _ = ServiceVehiclePrice.objects.update_or_create(
            service=service,
            vehicle_type=vehicle_type,
            defaults={'price': price},
        )
        return Response(ServiceVehiclePriceSerializer(instance).data, status=status.HTTP_200_OK)


class ServiceVehiclePriceDeleteView(APIView):
    def delete(self, request, pk):
        try:
            price = ServiceVehiclePrice.objects.get(pk=pk)
        except ServiceVehiclePrice.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        price.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)