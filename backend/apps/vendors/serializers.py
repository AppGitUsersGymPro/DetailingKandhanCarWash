from decimal import Decimal
from rest_framework import serializers
from .models import Vendor, ProductType, Product, Inventory, Invoice, InvoiceItem, InvoicePayment


class VendorSerializer(serializers.ModelSerializer):
    total_invoiced = serializers.SerializerMethodField()
    total_paid = serializers.SerializerMethodField()
    outstanding = serializers.SerializerMethodField()
    invoice_stats = serializers.SerializerMethodField()

    class Meta:
        model = Vendor
        fields = '__all__'

    def _stats(self, obj):
        """Compute all financial + invoice-count stats in a single Python pass.
        Works from prefetch cache when the queryset includes
        prefetch_related('invoice_set__payments').
        """
        if hasattr(obj, '_vendor_stats_cache'):
            return obj._vendor_stats_cache

        total_invoiced = Decimal('0')
        total_paid_amt = Decimal('0')
        paid_count = partial_count = unpaid_count = 0

        for inv in obj.invoice_set.all():
            total_invoiced += inv.total_amount
            inv_paid = sum((p.amount for p in inv.payments.all()), Decimal('0'))
            total_paid_amt += inv_paid
            if inv_paid >= inv.total_amount:
                paid_count += 1
            elif inv_paid > 0:
                partial_count += 1
            else:
                unpaid_count += 1

        obj._vendor_stats_cache = {
            'total_invoiced': total_invoiced,
            'total_paid': total_paid_amt,
            'outstanding': total_invoiced - total_paid_amt,
            'total': paid_count + partial_count + unpaid_count,
            'paid': paid_count,
            'partial': partial_count,
            'unpaid': unpaid_count,
        }
        return obj._vendor_stats_cache

    def get_total_invoiced(self, obj):
        return str(self._stats(obj)['total_invoiced'])

    def get_total_paid(self, obj):
        return str(self._stats(obj)['total_paid'])

    def get_outstanding(self, obj):
        return str(self._stats(obj)['outstanding'])

    def get_invoice_stats(self, obj):
        s = self._stats(obj)
        return {'total': s['total'], 'paid': s['paid'], 'partial': s['partial'], 'unpaid': s['unpaid']}


class ProductTypeSerializer(serializers.ModelSerializer):
    product_count = serializers.SerializerMethodField()

    class Meta:
        model = ProductType
        fields = ['id', 'name', 'description', 'product_count', 'created_at']

    def get_product_count(self, obj):
        return obj.products.count()


class ProductSerializer(serializers.ModelSerializer):
    type_name = serializers.SerializerMethodField()
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    product_code = serializers.CharField(read_only=True)

    class Meta:
        model = Product
        fields = '__all__'

    def get_type_name(self, obj):
        return obj.product_type.name if obj.product_type_id else None


class InventorySerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.product_name', read_only=True)
    product_code = serializers.CharField(source='product.product_code', read_only=True)
    category     = serializers.CharField(source='product.category', read_only=True)
    type_name    = serializers.SerializerMethodField()
    is_low_stock = serializers.BooleanField(read_only=True)
    unit         = serializers.CharField(source='product.product_unit', read_only=True)
    # brand, cost_price, selling_price come from the model fields directly

    class Meta:
        model = Inventory
        fields = '__all__'

    def get_type_name(self, obj):
        return obj.product.product_type.name if obj.product.product_type_id else None


class InvoicePaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoicePayment
        fields = '__all__'
        read_only_fields = ('invoice', 'created_at')


class InvoiceItemSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()
    product_unit = serializers.SerializerMethodField()

    class Meta:
        model = InvoiceItem
        fields = '__all__'
        read_only_fields = ('invoice',)

    def get_product_name(self, obj):
        if obj.product_name:
            return obj.product_name
        return obj.product.product_name if obj.product_id else None

    def get_product_unit(self, obj):
        if obj.product_unit:
            return obj.product_unit
        return obj.product.product_unit if obj.product_id else None


class InvoiceSerializer(serializers.ModelSerializer):
    items = InvoiceItemSerializer(many=True, read_only=True)
    payments = InvoicePaymentSerializer(many=True, read_only=True)
    vendor_name = serializers.CharField(source='vendor.vendor_name', read_only=True)
    total_paid = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    outstanding_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    payment_status = serializers.CharField(read_only=True)

    class Meta:
        model = Invoice
        fields = '__all__'


class InvoiceCreateSerializer(serializers.ModelSerializer):
    items = InvoiceItemSerializer(many=True)
    invoice_number = serializers.CharField(read_only=True)

    class Meta:
        model = Invoice
        fields = '__all__'

    def _upsert_inventory(self, product, brand, unit_amount, cost_price, selling_price, delta):
        brand = brand or ''
        inv, _ = Inventory.objects.get_or_create(
            product=product,
            brand=brand,
            unit_amount=unit_amount,
            cost_price=cost_price,
            defaults={'quantity_available': 0, 'minimum_threshold': 0, 'selling_price': selling_price},
        )
        if selling_price is not None:
            inv.selling_price = selling_price
        inv.quantity_available += delta
        inv.save()

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        invoice = Invoice.objects.create(**validated_data)
        for item_data in items_data:
            InvoiceItem.objects.create(invoice=invoice, **item_data)
            self._upsert_inventory(
                product=item_data['product'],
                brand=item_data.get('product_brand'),
                unit_amount=item_data.get('unit_amount', 1),
                cost_price=item_data['unit_price'],
                selling_price=item_data.get('selling_price'),
                delta=item_data['quantity'],
            )
        return invoice

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items')

        for old in instance.items.all():
            try:
                inv = Inventory.objects.get(
                    product=old.product,
                    brand=old.product_brand or '',
                    unit_amount=old.unit_amount,
                    cost_price=old.unit_price,
                )
                inv.quantity_available -= old.quantity
                inv.save()
            except Inventory.DoesNotExist:
                pass
        instance.items.all().delete()

        instance.vendor           = validated_data.get('vendor', instance.vendor)
        instance.vendor_invoice_id = validated_data.get('vendor_invoice_id', instance.vendor_invoice_id)
        instance.total_amount     = validated_data.get('total_amount', instance.total_amount)
        instance.invoice_date     = validated_data.get('invoice_date', instance.invoice_date)
        instance.save()

        for item_data in items_data:
            InvoiceItem.objects.create(invoice=instance, **item_data)
            self._upsert_inventory(
                product=item_data['product'],
                brand=item_data.get('product_brand'),
                unit_amount=item_data.get('unit_amount', 1),
                cost_price=item_data['unit_price'],
                selling_price=item_data.get('selling_price'),
                delta=item_data['quantity'],
            )
        return instance
