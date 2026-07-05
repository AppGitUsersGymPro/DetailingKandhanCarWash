from rest_framework import serializers
from .models import Customer, CustomerAsset, VehicleCompany, VehicleModel, VehicleColour, GarageOwner


class VehicleCompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleCompany
        fields = ['id', 'name', 'vehicle_type']


class VehicleModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleModel
        fields = ['id', 'name', 'company_name']


class VehicleColourSerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleColour
        fields = ['id', 'name']


class GarageOwnerSerializer(serializers.ModelSerializer):
    class Meta:
        model = GarageOwner
        fields = '__all__'


class CustomerAssetSerializer(serializers.ModelSerializer):
    customer_name         = serializers.CharField(source='customer.customer_name', read_only=True, allow_null=True)
    customer_phone_number = serializers.CharField(source='customer.phone_number',  read_only=True)
    # Derived from the vehicle's latest job card (only set when the view annotates it).
    vehicle_subtype      = serializers.CharField(source='vehicle_sub_type', read_only=True, allow_null=True)

    class Meta:
        model = CustomerAsset
        fields = '__all__'

    # def get_vehicle_sub_type(self, obj):
    #     return getattr(obj, 'vehicle_sub_type', None)


class CustomerSerializer(serializers.ModelSerializer):
    vehicles     = CustomerAssetSerializer(many=True, read_only=True)
    garage_owner_id = serializers.IntegerField(source='garage_owner.id', read_only=True, allow_null=True)

    class Meta:
        model  = Customer
        fields = '__all__'