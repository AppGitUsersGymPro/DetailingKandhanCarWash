# serializers.py
from rest_framework import serializers
from .models import Estimation, EstimationItem

class EstimationItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = EstimationItem
        fields = ['id', 'service_name', 'amount']

class EstimationSerializer(serializers.ModelSerializer):
    items = EstimationItemSerializer(many=True)
    
    class Meta:
        model = Estimation
        fields = '__all__'
        read_only_fields = ['total_amount', 'created_at']

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        total = sum(item['amount'] for item in items_data)
        estimation = Estimation.objects.create(total_amount=total, **validated_data)
        EstimationItem.objects.bulk_create([
            EstimationItem(estimation=estimation, **item)
            for item in items_data
        ])
        return estimation