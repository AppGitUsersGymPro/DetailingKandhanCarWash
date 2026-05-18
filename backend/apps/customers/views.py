from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Customer, CustomerAsset, normalize_phone
from .serializers import CustomerSerializer, CustomerAssetSerializer


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
            serializer.save()
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
        asset = CustomerAsset.objects.filter(vehicle_number=vehicle_number).first()
        if not asset:
            return Response({'exists': False}, status=status.HTTP_200_OK)
        return Response({
            'exists': True,
            'customer': {
                'id': asset.customer.id,
                'customer_name': asset.customer.customer_name,
                'phone_number': asset.customer.phone_number,
                'email': asset.customer.email,
            },
            'vehicle': {
                'id': asset.id,
                'vehicle_number': asset.vehicle_number,
                'vehicle_name': asset.vehicle_name,
                'vehicle_type': asset.vehicle_type,
            },
        }, status=status.HTTP_200_OK)


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
                'customer_name': customer.customer_name,
                'phone_number': customer.phone_number,
                'email': customer.email,
            },
        }, status=status.HTTP_200_OK)