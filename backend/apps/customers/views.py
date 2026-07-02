import logging
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Q
from .models import Customer, CustomerAsset, VehicleCompany, VehicleModel, VehicleColour, GarageOwner, normalize_phone

logger = logging.getLogger(__name__)
from .serializers import (
    CustomerSerializer, CustomerAssetSerializer,
    VehicleCompanySerializer, VehicleModelSerializer, VehicleColourSerializer,
    GarageOwnerSerializer,
)


# ─── Customer ─────────────────────────────────────────

class CustomerListView(APIView):
    def get(self, request):
        name = request.query_params.get('name', None)
        if name:
            customers = Customer.objects.filter(customer_name__icontains=name)
        else:
            customers = Customer.objects.all()
        serializer = CustomerSerializer(customers, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = CustomerSerializer(data=request.data)
        if serializer.is_valid():
            customer = serializer.save()

            try:
                from apps.notifications.utils import queue_notification, _get_business_name
                queue_notification(
                    recipient_name=customer.customer_name or customer.phone_number,
                    phone=customer.phone_number,
                    trigger_type='customer_welcome',
                    business_name=_get_business_name(),
                )
            except Exception:
                logger.exception("customer_welcome notification failed for customer %s", customer.id)

            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CustomerDetailView(APIView):
    def get_object(self, pk):
        try:
            return Customer.objects.get(pk=pk)
        except Customer.DoesNotExist:
            return None

    def get(self, request, pk):
        customer = self.get_object(pk)
        if not customer:
            return Response(
                {'error': 'Customer not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        serializer = CustomerSerializer(customer)
        return Response(serializer.data)

    def put(self, request, pk):
        customer = self.get_object(pk)
        if not customer:
            return Response(
                {'error': 'Customer not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        serializer = CustomerSerializer(customer, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        customer = self.get_object(pk)
        if not customer:
            return Response(
                {'error': 'Customer not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        customer.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Customer Asset ───────────────────────────────────

class CustomerAssetListView(APIView):
    # GET all vehicles of a specific customer
    # POST add a new vehicle to a customer
    def get(self, request, customer_pk):
        assets = CustomerAsset.objects.filter(customer_id=customer_pk)
        serializer = CustomerAssetSerializer(assets, many=True)
        return Response(serializer.data)

    def post(self, request, customer_pk):
        # Check customer exists
        try:
            customer = Customer.objects.get(pk=customer_pk)
        except Customer.DoesNotExist:
            return Response(
                {'error': 'Customer not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        # Inject customer id into request data
        data = request.data.copy()
        data['customer'] = customer.id
        serializer = CustomerAssetSerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CustomerAssetDetailView(APIView):
    def get_object(self, pk):
        try:
            return CustomerAsset.objects.get(pk=pk)
        except CustomerAsset.DoesNotExist:
            return None

    def get(self, request, pk):
        asset = self.get_object(pk)
        if not asset:
            return Response(
                {'error': 'Vehicle not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        serializer = CustomerAssetSerializer(asset)
        return Response(serializer.data)

    def put(self, request, pk):
        asset = self.get_object(pk)
        if not asset:
            return Response(
                {'error': 'Vehicle not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        serializer = CustomerAssetSerializer(asset, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, pk):
        asset = self.get_object(pk)
        if not asset:
            return Response(
                {'error': 'Vehicle not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        serializer = CustomerAssetSerializer(asset, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        asset = self.get_object(pk)
        if not asset:
            return Response(
                {'error': 'Vehicle not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        asset.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    
class VehicleFetchView(APIView):
    def get(self, request):
        vehicle_number = request.query_params.get('vehicle_number')
        if not vehicle_number:
            return Response({'exists': False}, status=status.HTTP_200_OK)
        asset = CustomerAsset.objects.select_related(
            'customer__garage_owner'
        ).filter(vehicle_number=vehicle_number).first()
        if not asset:
            return Response({'exists': False}, status=status.HTTP_200_OK)
        garage     = asset.customer.garage_owner
        is_garage  = garage is not None
        return Response({
            'exists':   True,
            'is_garage': is_garage,
            'garage': {
                'id':           garage.id,
                'name':         garage.name,
                'garage_name':  garage.garage_name,
                'phone_number': garage.phone_number,
                'email':        garage.email,
                'location':     garage.location,
                'gstin':        garage.gstin,
            } if is_garage else None,
            'customer': {
                'id':            asset.customer.id,
                'customer_name': asset.customer.customer_name or "Unknown Person",
                'phone_number':  asset.customer.phone_number,
                'email':         asset.customer.email,
            },
            'vehicle': {
                'id':             asset.id,
                'vehicle_number': asset.vehicle_number,
                'vehicle_name':   asset.vehicle_name,
                'vehicle_company':asset.vehicle_company,
                'vehicle_model':  asset.vehicle_model,
                'vehicle_colour': asset.vehicle_colour,
                'vehicle_type':   asset.vehicle_type,
            },
        }, status=status.HTTP_200_OK)


# ─── Vehicle Lookup Tables ────────────────────────────

class VehicleCompanyListView(APIView):
    def get(self, request):
        q = request.query_params.get('q', '')
        vehicle_type = request.query_params.get('vehicle_type', '')
        qs = VehicleCompany.objects.all()
        if vehicle_type:
            qs = qs.filter(Q(vehicle_type=vehicle_type) | Q(vehicle_type=''))
        if q:
            qs = qs.filter(name__icontains=q)
        return Response(VehicleCompanySerializer(qs[:30], many=True).data)

    def post(self, request):
        name = (request.data.get('name') or '').strip()
        vehicle_type = (request.data.get('vehicle_type') or '').strip()
        if not name:
            return Response({'name': 'Required'}, status=status.HTTP_400_BAD_REQUEST)
        obj = VehicleCompany.objects.filter(name__iexact=name, vehicle_type=vehicle_type).first()
        if not obj:
            obj = VehicleCompany.objects.create(name=name, vehicle_type=vehicle_type)
        return Response(VehicleCompanySerializer(obj).data, status=status.HTTP_201_CREATED)


class VehicleModelListView(APIView):
    def get(self, request):
        q = request.query_params.get('q', '')
        company = request.query_params.get('company', '')
        qs = VehicleModel.objects.all()
        if company:
            qs = qs.filter(company_name__iexact=company)
        if q:
            qs = qs.filter(name__icontains=q)
        return Response(VehicleModelSerializer(qs[:30], many=True).data)

    def post(self, request):
        name = (request.data.get('name') or '').strip()
        company_name = (request.data.get('company_name') or '').strip()
        if not name:
            return Response({'name': 'Required'}, status=status.HTTP_400_BAD_REQUEST)
        obj = VehicleModel.objects.filter(name__iexact=name, company_name__iexact=company_name).first()
        if not obj:
            obj = VehicleModel.objects.create(name=name, company_name=company_name)
        return Response(VehicleModelSerializer(obj).data, status=status.HTTP_201_CREATED)


class VehicleColourListView(APIView):
    def get(self, request):
        q = request.query_params.get('q', '')
        qs = VehicleColour.objects.all()
        if q:
            qs = qs.filter(name__icontains=q)
        return Response(VehicleColourSerializer(qs[:30], many=True).data)

    def post(self, request):
        name = (request.data.get('name') or '').strip()
        if not name:
            return Response({'name': 'Required'}, status=status.HTTP_400_BAD_REQUEST)
        obj = VehicleColour.objects.filter(name__iexact=name).first()
        if not obj:
            obj = VehicleColour.objects.create(name=name)
        return Response(VehicleColourSerializer(obj).data, status=status.HTTP_201_CREATED)


class CustomerFetchView(APIView):
    def get(self, request):
        phone_number = normalize_phone(request.query_params.get('phone_number'))
        if not phone_number:
            return Response({'exists': False}, status=status.HTTP_200_OK)
        customer = Customer.objects.filter(phone_number=phone_number).first()
        if not customer:
            return Response({'exists': False}, status=status.HTTP_200_OK)
        return Response({
            'exists': True,
            'customer': {
                'id': customer.id,
                'customer_name': customer.customer_name or "Unknown Number",
                'phone_number': customer.phone_number,
                'email': customer.email,
            },
        }, status=status.HTTP_200_OK)


class AllVehiclesListView(APIView):
    """List all vehicles across all customers with filtering support."""
    def get(self, request):
        qs = CustomerAsset.objects.select_related('customer').all()
        search       = request.query_params.get('search', '')
        vehicle_type = request.query_params.get('vehicle_type', '')
        company      = request.query_params.get('company', '')
        if search:
            qs = qs.filter(
                Q(vehicle_number__icontains=search) |
                Q(vehicle_name__icontains=search) |
                Q(vehicle_company__icontains=search) |
                Q(vehicle_model__icontains=search) |
                Q(customer__customer_name__icontains=search)
            )
        if vehicle_type:
            qs = qs.filter(vehicle_type=vehicle_type)
        if company:
            qs = qs.filter(vehicle_company__icontains=company)
        serializer = CustomerAssetSerializer(qs, many=True)
        return Response(serializer.data)


# ─── Garage Owner ─────────────────────────────────────

class GarageOwnerListCreateView(APIView):
    def get(self, request):
        q  = request.query_params.get('q', '')
        qs = GarageOwner.objects.all().order_by('garage_name')
        if q:
            qs = qs.filter(
                Q(garage_name__icontains=q) |
                Q(name__icontains=q) |
                Q(phone_number__icontains=q)
            )
        return Response(GarageOwnerSerializer(qs, many=True).data)

    def post(self, request):
        serializer = GarageOwnerSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class GarageOwnerDetailView(APIView):
    def get_object(self, pk):
        try:
            return GarageOwner.objects.get(pk=pk)
        except GarageOwner.DoesNotExist:
            return None

    def get(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(GarageOwnerSerializer(obj).data)

    def put(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = GarageOwnerSerializer(obj, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)