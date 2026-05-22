from decimal import Decimal
from rest_framework import serializers
from django.db import transaction
from django.db.models import Q

from apps.customers.models import Customer, CustomerAsset, normalize_phone
from apps.services.models import Service
from .models import JobCard, JobCardService, JobCardEmployee, JobCardPayment


class JobCardEmployeeSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(
        source='employee.employee_name',
        read_only=True
    )

    class Meta:
        model = JobCardEmployee
        fields = '__all__'


class JobCardServiceSerializer(serializers.ModelSerializer):
    employees = JobCardEmployeeSerializer(many=True, read_only=True)
    service_name = serializers.CharField(
        source='service.service_name',
        read_only=True
    )

    class Meta:
        model = JobCardService
        fields = '__all__'


class JobCardPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobCardPayment
        fields = '__all__'


class JobCardSerializer(serializers.ModelSerializer):
    job_card_services = JobCardServiceSerializer(many=True, read_only=True)
    payments          = JobCardPaymentSerializer(many=True, read_only=True)
    vehicle_number    = serializers.CharField(source='customer_asset.vehicle_number', read_only=True)
    vehicle_type      = serializers.CharField(source='customer_asset.vehicle_type', read_only=True)
    customer_name     = serializers.CharField(source='customer_asset.customer.customer_name', read_only=True)
    phone_number      = serializers.CharField(source='customer_asset.customer.phone_number', read_only=True)

    base_amount    = serializers.SerializerMethodField()
    gst_amount     = serializers.SerializerMethodField()
    total_amount   = serializers.SerializerMethodField()
    paid_amount    = serializers.SerializerMethodField()
    outstanding    = serializers.SerializerMethodField()
    payment_status = serializers.SerializerMethodField()

    class Meta:
        model = JobCard
        fields = '__all__'

    def _financials(self, obj):
        base = sum(s.price_at_time for s in obj.job_card_services.all())
        gst  = (base * obj.gst_percent / Decimal('100')).quantize(Decimal('0.01'))
        total = base + gst
        paid  = sum(p.amount for p in obj.payments.all())
        return base, gst, total, paid

    def get_base_amount(self, obj):
        base, *_ = self._financials(obj)
        return str(base)

    def get_gst_amount(self, obj):
        _, gst, *_ = self._financials(obj)
        return str(gst)

    def get_total_amount(self, obj):
        _, _, total, _ = self._financials(obj)
        return str(total)

    def get_paid_amount(self, obj):
        _, _, _, paid = self._financials(obj)
        return str(paid)

    def get_outstanding(self, obj):
        _, _, total, paid = self._financials(obj)
        return str(total - paid)

    def get_payment_status(self, obj):
        _, _, total, paid = self._financials(obj)
        if total <= 0:
            return 'unpaid'
        if paid >= total:
            return 'paid'
        if paid > 0:
            return 'partial'
        return 'unpaid'


class CustomerInputSerializer(serializers.Serializer):
    is_new        = serializers.BooleanField()
    id            = serializers.IntegerField(required=False, allow_null=True)
    customer_name = serializers.CharField(required=False, allow_blank=True)
    phone_number  = serializers.CharField(required=False, allow_blank=True)
    email         = serializers.EmailField(required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs['is_new']:
            if not attrs.get('customer_name'):
                raise serializers.ValidationError({'customer_name': 'Required for new customer'})
            if not attrs.get('phone_number'):
                raise serializers.ValidationError({'phone_number': 'Required for new customer'})
        elif not attrs.get('id'):
            raise serializers.ValidationError({'id': 'Required for existing customer'})
        return attrs


class VehicleInputSerializer(serializers.Serializer):
    is_new       = serializers.BooleanField()
    id           = serializers.IntegerField(required=False, allow_null=True)
    vehicle_number = serializers.CharField()
    vehicle_name = serializers.CharField(required=False, allow_blank=True)
    vehicle_type = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs['is_new']:
            if not attrs.get('vehicle_name'):
                raise serializers.ValidationError({'vehicle_name': 'Required for new vehicle'})
        elif not attrs.get('id'):
            raise serializers.ValidationError({'id': 'Required for existing vehicle'})
        return attrs


class JobCardCoreSerializer(serializers.Serializer):
    job_card_number           = serializers.CharField()
    job_card_date             = serializers.DateField()
    vehicle_kilometers        = serializers.DecimalField(max_digits=10, decimal_places=2)
    vehicle_entry_time        = serializers.DateTimeField()
    vehicle_expected_exit_time = serializers.DateTimeField()
    complaints                = serializers.CharField(allow_blank=True, required=False)
    gst_percent               = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, default=Decimal('18.00')
    )


class FullJobCardCreateSerializer(serializers.Serializer):
    job_card = JobCardCoreSerializer()
    customer = CustomerInputSerializer()
    vehicle  = VehicleInputSerializer()
    services = serializers.ListField(
        child=serializers.IntegerField(),
        allow_empty=False,
    )

    @transaction.atomic
    def create(self, validated_data):
        c  = validated_data['customer']
        v  = validated_data['vehicle']
        jc = validated_data['job_card']

        if c['is_new']:
            phone    = normalize_phone(c['phone_number'])
            email    = c.get('email', '')
            lookup   = Q(phone_number=phone)
            if email:
                lookup |= Q(email__iexact=email)
            existing = Customer.objects.filter(lookup).first()
            if existing:
                customer = existing
            else:
                customer = Customer.objects.create(
                    customer_name=c['customer_name'],
                    phone_number=phone,
                    email=email,
                )
        else:
            customer = Customer.objects.get(pk=c['id'])

        if v['is_new']:
            existing_asset = CustomerAsset.objects.filter(
                vehicle_number=v['vehicle_number']
            ).first()
            if existing_asset:
                asset = existing_asset
            else:
                asset = CustomerAsset.objects.create(
                    customer=customer,
                    vehicle_number=v['vehicle_number'],
                    vehicle_name=v.get('vehicle_name', ''),
                    vehicle_type=v.get('vehicle_type') or 'other',
                )
        else:
            asset = CustomerAsset.objects.get(pk=v['id'])

        job_card = JobCard.objects.create(customer_asset=asset, **jc)

        for sid in validated_data['services']:
            svc = Service.objects.get(pk=sid)
            JobCardService.objects.create(
                job_card=job_card,
                service=svc,
                price_at_time=svc.service_price,
            )

        return job_card

    def to_representation(self, instance):
        return JobCardSerializer(instance).data
