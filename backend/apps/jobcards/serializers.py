from datetime import timezone
import logging
from decimal import Decimal
from rest_framework import serializers
from django.db import transaction
from django.db.models import Q

logger = logging.getLogger(__name__)

from apps.customers.models import Customer, CustomerAsset, normalize_phone
from apps.services.models import Service, ServiceProduct, ServiceVehiclePrice
from apps.vendors.models import Inventory
from .models import JobCard, JobCardProduct, JobCardProductUsage, JobCardService, JobCardEmployee, JobCardPayment, JobCardSalesProduct, SalesOrder, SalesOrderItem


class JobCardEmployeeSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(
        source='employee.employee_name',
        read_only=True
    )

    class Meta:
        model = JobCardEmployee
        fields = '__all__'


class JobCardServiceSerializer(serializers.ModelSerializer):
    employees     = JobCardEmployeeSerializer(many=True, read_only=True)
    service_name  = serializers.CharField(source='service.service_name', read_only=True)
    reduces_stock = serializers.BooleanField(source='service.reduces_stock', read_only=True)
    has_usages    = serializers.SerializerMethodField()

    class Meta:
        model = JobCardService
        fields = '__all__'

    def get_has_usages(self, obj):
        """True if at least one product usage has been recorded for this service."""
        return any(
        usage
        for jcp in obj.products.all()
        for usage in jcp.usages.all()
    )


class JobCardPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobCardPayment
        fields = '__all__'


class JobCardSalesProductSerializer(serializers.ModelSerializer):
    product_name      = serializers.CharField(source='inventory.product.product_name', read_only=True)
    product_type_name = serializers.SerializerMethodField()
    unit              = serializers.CharField(source='inventory.product.product_unit', read_only=True)
    brand             = serializers.CharField(source='inventory.brand', read_only=True)
    unit_amount       = serializers.DecimalField(source='inventory.unit_amount', max_digits=10, decimal_places=2, read_only=True)
    line_total        = serializers.SerializerMethodField()

    class Meta:
        model  = JobCardSalesProduct
        fields = ['id', 'job_card', 'inventory', 'quantity', 'unit_price',
                  'product_name', 'product_type_name', 'unit', 'brand', 'unit_amount',
                  'line_total', 'created_at']

    def get_product_type_name(self, obj):
        pt = obj.inventory.product.product_type
        return pt.name if pt else None

    def get_line_total(self, obj):
        return str((obj.unit_price * obj.quantity).quantize(Decimal('0.01')))


class JobCardSerializer(serializers.ModelSerializer):
    job_card_services  = JobCardServiceSerializer(many=True, read_only=True)
    payments           = JobCardPaymentSerializer(many=True, read_only=True)
    sales_products     = JobCardSalesProductSerializer(many=True, read_only=True)
    vehicle_number     = serializers.CharField(source='customer_asset.vehicle_number', read_only=True)
    vehicle_type       = serializers.CharField(source='customer_asset.vehicle_type', read_only=True)
    vehicle_company    = serializers.CharField(source='customer_asset.vehicle_company', read_only=True)
    vehicle_model      = serializers.CharField(source='customer_asset.vehicle_model', read_only=True)
    vehicle_colour     = serializers.CharField(source='customer_asset.vehicle_colour', read_only=True)
    customer_id        = serializers.IntegerField(source='customer_asset.customer.id', read_only=True)
    customer_name      = serializers.CharField(source='customer_asset.customer.customer_name', read_only=True, allow_null = True)
    phone_number       = serializers.CharField(source='customer_asset.customer.phone_number', read_only=True)
    employee_name      = serializers.CharField(source='employee.employee_name', read_only=True, default=None)
    garage_owner_id    = serializers.IntegerField(source='garage_owner.id', read_only=True, allow_null=True)
    garage_name        = serializers.SerializerMethodField()

    def get_garage_name(self, obj):
        return obj.garage_owner.garage_name if obj.garage_owner_id else None

    base_amount          = serializers.SerializerMethodField()
    gst_amount           = serializers.SerializerMethodField()
    services_total       = serializers.SerializerMethodField()
    total_amount         = serializers.SerializerMethodField()
    paid_amount          = serializers.SerializerMethodField()
    outstanding          = serializers.SerializerMethodField()
    payment_status       = serializers.SerializerMethodField()
    usage_complete       = serializers.SerializerMethodField()
    sales_products_total = serializers.SerializerMethodField()

    class Meta:
        model = JobCard
        ordering = ['-job_card_date', '-vehicle_entry_time']
        fields = '__all__'

    def _financials(self, obj):
        # Service prices are GST-inclusive; back-calculate base and GST portion
        svc_total = sum(s.price_at_time for s in obj.job_card_services.all())
        if obj.gst_percent > 0:
            divisor = svc_total * ( obj.gst_percent / Decimal('100'))
            total = svc_total + divisor
            gst  = total-svc_total 
        else:
            total     = svc_total
            gst      = Decimal('0')
        sales = sum(
            (sp.unit_price * sp.quantity for sp in obj.sales_products.all()),
            Decimal('0')
        )
        paid = sum(p.amount for p in obj.payments.all())
        return svc_total, gst, total, sales, paid

    def get_base_amount(self, obj):
        base, *_ = self._financials(obj)
        return str(base)

    def get_gst_amount(self, obj):
        _, gst, *_ = self._financials(obj)
        return str(gst)

    def get_services_total(self, obj):
        _, _, svc_total, *_ = self._financials(obj)
        return str(svc_total)

    def get_sales_products_total(self, obj):
        _, _, _, sales, _ = self._financials(obj)
        return str(sales.quantize(Decimal('0.01')))

    def get_total_amount(self, obj):
        _, _, svc_total, sales, _ = self._financials(obj)
        return str((svc_total + sales).quantize(Decimal('0.01')))

    def get_paid_amount(self, obj):
        *_, paid = self._financials(obj)
        return str(paid)

    def get_outstanding(self, obj):
        _, _, svc_total, sales, paid = self._financials(obj)
        grand = svc_total + sales
        return str((grand - paid).quantize(Decimal('0.01')))

    def get_payment_status(self, obj):
        _, _, svc_total, sales, paid = self._financials(obj)
        grand = svc_total + sales
        if grand <= 0:
            return 'unpaid'
        if paid >= grand:
            return 'paid'
        if paid > 0:
            return 'partial'
        return 'unpaid'

    def get_usage_complete(self, obj):
        """True if every completed stock-reducing service with linked products has at least one usage recorded."""
        for svc in obj.job_card_services.all():
            if svc.service_status != 'completed':
                continue
            if not svc.service.reduces_stock:
                continue
            products = list(svc.products.all())
            if products:
                has_any = any(
                usage
                for product in products
                for usage in product.usages.all()  # uses prefetch cache, no query
            )
                if not has_any:
                    return False
        return True



class CustomerInputSerializer(serializers.Serializer):
    is_new        = serializers.BooleanField()
    id            = serializers.IntegerField(required=False, allow_null=True)
    customer_name = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    phone_number  = serializers.CharField(required=False, allow_blank=True)
    email         = serializers.EmailField(required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs['is_new']:
            if not attrs.get('phone_number'):
                raise serializers.ValidationError({'phone_number': 'Required for new customer'})
        elif not attrs.get('id'):
            raise serializers.ValidationError({'id': 'Required for existing customer'})
        return attrs


class VehicleInputSerializer(serializers.Serializer):
    is_new          = serializers.BooleanField()
    id              = serializers.IntegerField(required=False, allow_null=True)
    vehicle_number  = serializers.CharField()
    vehicle_name    = serializers.CharField(required=False, allow_blank=True)
    vehicle_company = serializers.CharField(required=False, allow_blank=True)
    vehicle_model   = serializers.CharField(required=False, allow_blank=True)
    vehicle_colour  = serializers.CharField(required=False, allow_blank=True)
    vehicle_type    = serializers.CharField(required=False, allow_blank=True)
    vehicle_sub_type  = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate(self, attrs):
        if not attrs.get('is_new') and not attrs.get('id'):
            raise serializers.ValidationError({'id': 'Required for existing vehicle'})
        return attrs


class JobCardCoreSerializer(serializers.Serializer):
    job_card_number            = serializers.CharField(required=False, allow_blank=True)
    job_card_date              = serializers.DateField()
    vehicle_kilometers         = serializers.DecimalField(max_digits=10, decimal_places=2)
    vehicle_entry_time         = serializers.DateTimeField()
    vehicle_expected_exit_time = serializers.DateTimeField(allow_null=True, required=False)
    complaints                 = serializers.CharField(allow_blank=True, required=False)
    gst_percent                = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, default=Decimal('18.00')
    )
    employee         = serializers.IntegerField(required=False, allow_null=True)
    vehicle_sub_type = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    total_amount = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)


class FullJobCardCreateSerializer(serializers.Serializer):
    job_card  = JobCardCoreSerializer()
    customer  = CustomerInputSerializer(required=False)
    vehicle   = VehicleInputSerializer()
    services  = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)
    garage_id = serializers.IntegerField(required=False, allow_null=True)
    amount_given = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)
    payment_type = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs.get('garage_id') and not attrs.get('customer'):
            raise serializers.ValidationError({'customer': 'Required when garage_id is not provided.'})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        from apps.customers.models import GarageOwner
        v  = validated_data['vehicle']
        jc = validated_data['job_card']
        garage_id  = validated_data.get('garage_id')
        job_card_garage = None

        if garage_id:
            garage = GarageOwner.objects.get(pk=garage_id)
            job_card_garage = garage
            # Find or create a proxy customer for this garage
            customer, _ = Customer.objects.get_or_create(
                garage_owner=garage,
                defaults={
                    'customer_name': garage.garage_name,
                    'phone_number':  garage.phone_number,
                    'email':         garage.email or None,
                },
            )
        else:
            c = validated_data['customer']
            if c['is_new']:
                phone  = normalize_phone(c['phone_number'])
                email  = c.get('email', '') or None
                lookup = Q(phone_number=phone)
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
                # Update vehicle details if provided
                changed = False
                for field in ('vehicle_company', 'vehicle_model', 'vehicle_colour', 'vehicle_name', 'vehicle_type'):
                    val = v.get(field, '')
                    if val and getattr(existing_asset, field) != val:
                        setattr(existing_asset, field, val)
                        changed = True
                if changed:
                    existing_asset.save()
                asset = existing_asset
            else:
                asset = CustomerAsset.objects.create(
                    customer=customer,
                    vehicle_number=v['vehicle_number'],
                    vehicle_name=v.get('vehicle_name', ''),
                    vehicle_company=v.get('vehicle_company', ''),
                    vehicle_model=v.get('vehicle_model', ''),
                    vehicle_colour=v.get('vehicle_colour', ''),
                    vehicle_type=v.get('vehicle_type') or 'other',
                    vehicle_sub_type=v.get('vehicle_sub_type') or '',
                )
        else:
            asset = CustomerAsset.objects.get(pk=v['id'])
            # Update vehicle details when coming from existing match
            changed = False
            for field in ('vehicle_company', 'vehicle_model', 'vehicle_colour'):
                val = v.get(field, '')
                if val and getattr(asset, field) != val:
                    setattr(asset, field, val)
                    changed = True
            if changed:
                asset.save()

        employee_id = jc.pop('employee', None)
        vehicle_sub_type = jc.pop('vehicle_sub_type', None) or None

        # Determine effective pricing type for vehicle-specific service prices
        vehicle_type = asset.vehicle_type
        if vehicle_type == 'four_wheeler' and vehicle_sub_type:
            effective_pricing_type = vehicle_sub_type
        elif vehicle_type == 'two_wheeler':
            effective_pricing_type = 'two_wheeler'
        else:
            effective_pricing_type = None

        job_card = JobCard.objects.create(
            customer_asset=asset,
            employee_id=employee_id,
            vehicle_sub_type=vehicle_sub_type,
            garage_owner=job_card_garage,
            **jc,
        )

        for sid in validated_data['services']:
            svc = Service.objects.get(pk=sid)
            price = svc.service_price
            if effective_pricing_type:
                try:
                    vp = ServiceVehiclePrice.objects.get(service=svc, vehicle_type=effective_pricing_type)
                    price = vp.price
                except ServiceVehiclePrice.DoesNotExist:
                    pass
            jc_service = JobCardService.objects.create(
                job_card=job_card,
                service=svc,
                price_at_time=price,
            )
            JobCardProduct.objects.bulk_create([
                JobCardProduct(job_card_service=jc_service, service_product=sp)
                for sp in ServiceProduct.objects.filter(service=svc)
            ])
        
        
        from .utils import recalculate_total
        recalculate_total(job_card)

        jobcard_id = job_card.id
        amount_given = validated_data.get('amount_given')
        payment_method = validated_data.get('payment_type', 'cash') or 'cash'
        if amount_given is not None and amount_given > 0:
            from django.utils import timezone
            from .utils import compute_gst_split
            gst_col, base_col = compute_gst_split(job_card, amount_given)
            JobCardPayment.objects.create(
                job_card_id=jobcard_id,
                amount=amount_given,
                payment_date=timezone.now().date(),
                payment_method=payment_method,
                gst_collected=gst_col,
                base_collected=base_col,
            )

        return job_card

    def to_representation(self, instance):
        return JobCardSerializer(instance).data

class JobCardProductUsageReadSerializer(serializers.ModelSerializer):
    inventory_id   = serializers.IntegerField(source='product.id', read_only=True)
    product_name   = serializers.CharField(source='product.product.product_name', read_only=True)
    brand          = serializers.CharField(source='product.brand', read_only=True)
    unit_amount    = serializers.DecimalField(source='product.unit_amount', max_digits=10, decimal_places=2, read_only=True)
    unit_label     = serializers.CharField(source='product.product.product_unit', read_only=True)

    class Meta:
        model  = JobCardProductUsage
        fields = ['id', 'inventory_id', 'product_name', 'brand', 'unit_amount', 'unit_label', 'quantity_used']


class ProductInfoSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='service_product.product.product_name', read_only=True)
    product_id   = serializers.IntegerField(source='service_product.product.id', read_only=True)
    usages       = JobCardProductUsageReadSerializer(many=True, read_only=True)

    class Meta:
        model  = JobCardProduct
        fields = ['id', 'product_id', 'product_name', 'usages']


class ProductsUsedSerializer(serializers.ModelSerializer):
    service_name  = serializers.CharField(source='service.service_name', read_only=True)
    reduces_stock = serializers.BooleanField(source='service.reduces_stock', read_only=True)
    products      = ProductInfoSerializer(many=True, read_only=True)

    class Meta:
        model  = JobCardService
        fields = ['id', 'service_name', 'reduces_stock', 'products']


class InventoryOptionSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.product_name', read_only=True)
    unit_label   = serializers.CharField(source='product.product_unit', read_only=True)

    class Meta:
        model  = Inventory
        fields = ['id', 'product_name', 'brand', 'unit_amount', 'unit_label', 'quantity_available']


class JobCardProductUsageCreateSerializer(serializers.Serializer):
    inventory_id  = serializers.IntegerField()
    quantity_used = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0.01'))

    def validate(self, attrs):
        jc_product = self.context['jc_product']
        try:
            inv = Inventory.objects.get(pk=attrs['inventory_id'])
        except Inventory.DoesNotExist:
            raise serializers.ValidationError({'inventory_id': 'Inventory row not found.'})

        if inv.product_id != jc_product.service_product.product_id:
            raise serializers.ValidationError({'inventory_id': 'This inventory item is for a different product.'})

        if inv.quantity_available < attrs['quantity_used']:
            raise serializers.ValidationError({
                'quantity_used': f'Only {inv.quantity_available} available in stock.'
            })

        attrs['inventory'] = inv
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        jc_product = self.context['jc_product']
        inv        = validated_data['inventory']
        qty        = validated_data['quantity_used']

        usage = JobCardProductUsage.objects.create(
            job_card_product=jc_product,
            product=inv,
            quantity_used=qty,
        )
        inv.quantity_available = inv.quantity_available - qty
        inv.save(update_fields=['quantity_available'])
        if inv.is_low_stock:
            try:
                from apps.notifications.utils import queue_notification, _get_business_name, _get_admin_phone
                admin_phone = _get_admin_phone()
                if admin_phone:
                    queue_notification(
                        recipient_name='Admin',
                        phone=admin_phone,
                        trigger_type='low_stock_alert',
                        product_name=inv.product.product_name,
                        brand=inv.brand or 'N/A',
                        quantity=str(inv.quantity_available),
                        unit=inv.product.product_unit,
                        business_name=_get_business_name(),
                    )
            except Exception:
                logger.exception("low_stock_alert failed for inventory %s", inv.id)
        return usage

    def to_representation(self, instance):
        return JobCardProductUsageReadSerializer(instance).data


class SalesInventorySerializer(serializers.ModelSerializer):
    product_name  = serializers.CharField(source='product.product_name', read_only=True)
    product_type  = serializers.SerializerMethodField()
    unit_label    = serializers.CharField(source='product.product_unit', read_only=True)

    class Meta:
        model  = Inventory
        fields = ['id', 'product_name', 'product_type', 'brand', 'unit_amount',
                  'unit_label', 'quantity_available', 'selling_price']

    def get_product_type(self, obj):
        pt = obj.product.product_type
        return pt.name if pt else None


class JobCardSalesProductCreateSerializer(serializers.Serializer):
    inventory_id = serializers.IntegerField()
    quantity     = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0.01'))
    unit_price   = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)

    def validate(self, attrs):
        try:
            inv = Inventory.objects.select_related('product').get(
                pk=attrs['inventory_id'],
                product__category='sales',
            )
        except Inventory.DoesNotExist:
            raise serializers.ValidationError({'inventory_id': 'Sales inventory item not found.'})

        if inv.quantity_available < attrs['quantity']:
            raise serializers.ValidationError(
                {'quantity': f'Only {inv.quantity_available} available in stock.'}
            )

        # Default unit_price to inventory selling_price
        if not attrs.get('unit_price'):
            if not inv.selling_price:
                raise serializers.ValidationError(
                    {'unit_price': 'This item has no selling price set. Please set one in inventory.'}
                )
            attrs['unit_price'] = inv.selling_price

        attrs['inventory'] = inv
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        from .models import JobCardSalesProduct
        job_card = self.context['job_card']
        inv      = validated_data['inventory']
        qty      = validated_data['quantity']
        price    = validated_data['unit_price']

        sp = JobCardSalesProduct.objects.create(
            job_card=job_card,
            inventory=inv,
            quantity=qty,
            unit_price=price,
        )
        inv.quantity_available -= qty
        inv.save(update_fields=['quantity_available'])
        if inv.is_low_stock:
            try:
                from apps.notifications.utils import queue_notification, _get_business_name, _get_admin_phone
                admin_phone = _get_admin_phone()
                if admin_phone:
                    queue_notification(
                        recipient_name='Admin',
                        phone=admin_phone,
                        trigger_type='low_stock_alert',
                        product_name=inv.product.product_name,
                        brand=inv.brand or 'N/A',
                        quantity=str(inv.quantity_available),
                        unit=inv.product.product_unit,
                        business_name=_get_business_name(),
                    )
            except Exception:
                logger.exception("low_stock_alert failed for inventory %s", inv.id)
        return sp

    def to_representation(self, instance):
        return JobCardSalesProductSerializer(instance).data


# ── Standalone Sales ──────────────────────────────────────────────────────────

class SalesOrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='inventory.product.product_name', read_only=True)
    brand        = serializers.CharField(source='inventory.brand', read_only=True)
    unit         = serializers.CharField(source='inventory.product.product_unit', read_only=True)
    unit_amount  = serializers.DecimalField(source='inventory.unit_amount', max_digits=10, decimal_places=2, read_only=True)
    line_total   = serializers.SerializerMethodField()

    class Meta:
        model  = SalesOrderItem
        fields = ['id', 'inventory', 'product_name', 'brand', 'unit', 'unit_amount',
                  'quantity', 'unit_price', 'line_total']

    def get_line_total(self, obj):
        return str((obj.unit_price * obj.quantity).quantize(Decimal('0.01')))


class SalesOrderSerializer(serializers.ModelSerializer):
    items        = SalesOrderItemSerializer(many=True, read_only=True)
    total_amount = serializers.SerializerMethodField()

    class Meta:
        model  = SalesOrder
        fields = ['id', 'order_number', 'customer', 'customer_name', 'phone_number',
                  'sale_date', 'payment_method', 'notes', 'created_at', 'items', 'total_amount',
                  'share_token']

    def get_total_amount(self, obj):
        total = sum(
            (it.unit_price * it.quantity for it in obj.items.all()),
            Decimal('0')
        )
        return str(total.quantize(Decimal('0.01')))


class SalesOrderCreateSerializer(serializers.Serializer):
    customer_id    = serializers.IntegerField(required=False, allow_null=True)
    customer_name  = serializers.CharField()
    phone_number   = serializers.CharField(allow_blank=True, required=False, default='')
    sale_date      = serializers.DateField()
    payment_method = serializers.CharField(default='cash')
    notes          = serializers.CharField(allow_blank=True, required=False, default='')
    items          = serializers.ListField(child=serializers.DictField(), allow_empty=False)
    total_amount   = serializers.DecimalField(max_digits = 10, decimal_places=2)

    def validate(self, attrs):
        validated_items = []
        for item in attrs['items']:
            try:
                inv = Inventory.objects.select_related('product').get(
                    pk=item['inventory_id'],
                    product__category='sales',
                )
            except (Inventory.DoesNotExist, KeyError):
                raise serializers.ValidationError({'items': f'Inventory item not found.'})

            qty = Decimal(str(item.get('quantity', 0)))
            if qty <= 0:
                raise serializers.ValidationError({'items': 'Quantity must be positive.'})
            if inv.quantity_available < qty:
                raise serializers.ValidationError(
                    {'items': f'Only {inv.quantity_available} in stock for {inv.product.product_name}.'}
                )
            price = Decimal(str(item['unit_price'])) if item.get('unit_price') else (inv.selling_price or Decimal('0'))
            validated_items.append({'inventory': inv, 'quantity': qty, 'unit_price': price})

        attrs['_validated_items'] = validated_items
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        items      = validated_data.pop('_validated_items')
        validated_data.pop('items')
        cust_id    = validated_data.pop('customer_id', None)

        customer = None
        if cust_id:
            try:
                customer = Customer.objects.get(pk=cust_id)
            except Customer.DoesNotExist:
                pass

        order = SalesOrder.objects.create(
            customer=customer,
            customer_name=validated_data['customer_name'],
            phone_number=validated_data.get('phone_number', ''),
            sale_date=validated_data['sale_date'],
            payment_method=validated_data.get('payment_method', 'cash'),
            notes=validated_data.get('notes', ''),
            total_amount = validated_data.get('total_amount',0),
        )
        for it in items:
            SalesOrderItem.objects.create(
                sales_order=order,
                inventory=it['inventory'],
                quantity=it['quantity'],
                unit_price=it['unit_price'],
            )
            it['inventory'].quantity_available -= it['quantity']
            it['inventory'].save(update_fields=['quantity_available'])
            if it['inventory'].is_low_stock:
                try:
                    from apps.notifications.utils import queue_notification, _get_business_name, _get_admin_phone
                    admin_phone = _get_admin_phone()
                    if admin_phone:
                        inv = it['inventory']
                        queue_notification(
                            recipient_name='Admin',
                            phone=admin_phone,
                            trigger_type='low_stock_alert',
                            product_name=inv.product.product_name,
                            brand=inv.brand or 'N/A',
                            quantity=str(inv.quantity_available),
                            unit=inv.product.product_unit,
                            business_name=_get_business_name(),
                        )
                except Exception:
                    logger.exception("low_stock_alert failed for inventory %s", it['inventory'].id)

        return order

    def to_representation(self, instance):
        return SalesOrderSerializer(instance).data