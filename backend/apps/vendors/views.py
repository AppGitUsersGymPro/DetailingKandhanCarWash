import logging
from decimal import Decimal
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db import transaction
from django.db.models import Prefetch
from .models import Vendor, ProductType, Product, Inventory, Invoice, InvoiceItem, InvoicePayment

logger = logging.getLogger(__name__)
from .serializers import (
    VendorSerializer, ProductTypeSerializer, ProductSerializer,
    InventorySerializer, InvoiceSerializer,
    InvoiceCreateSerializer, InvoicePaymentSerializer,
)


# ─── Vendor ───────────────────────────────────────────

class VendorListCreateView(APIView):
    def _vendor_qs(self):
        return Vendor.objects.prefetch_related(
            Prefetch('invoice_set', queryset=Invoice.objects.prefetch_related('payments'))
        )

    def get(self, request):
        name = request.query_params.get('name', None)
        qs = self._vendor_qs()
        if name:
            qs = qs.filter(vendor_name__icontains=name)
        serializer = VendorSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = VendorSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class VendorDetailView(APIView):
    def _get_vendor(self, pk):
        return (
            Vendor.objects
            .prefetch_related(Prefetch('invoice_set', queryset=Invoice.objects.prefetch_related('payments')))
            .filter(pk=pk)
            .first()
        )

    def get(self, request, pk):
        vendor = self._get_vendor(pk)
        if not vendor:
            return Response({'error': 'Vendor not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(VendorSerializer(vendor).data)

    def put(self, request, pk):
        vendor = self._get_vendor(pk)
        if not vendor:
            return Response({'error': 'Vendor not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = VendorSerializer(vendor, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(VendorSerializer(self._get_vendor(pk)).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        vendor = self._get_vendor(pk)
        if not vendor:
            return Response({'error': 'Vendor not found'}, status=status.HTTP_404_NOT_FOUND)
        vendor.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class VendorStatementView(APIView):
    def get(self, request, pk):
        vendor = (
            Vendor.objects
            .prefetch_related(Prefetch('invoice_set', queryset=Invoice.objects.prefetch_related('payments')))
            .filter(pk=pk).first()
        )
        if not vendor:
            return Response({'error': 'Vendor not found'}, status=status.HTTP_404_NOT_FOUND)

        invoices = (
            Invoice.objects
            .filter(vendor=vendor)
            .prefetch_related('items__product', 'payments')
            .order_by('invoice_date')
        )
        invoice_data = InvoiceSerializer(invoices, many=True).data

        total_invoiced = sum(Decimal(str(inv['total_amount'])) for inv in invoice_data)
        total_paid = sum(Decimal(str(inv['total_paid'])) for inv in invoice_data)

        return Response({
            'vendor': VendorSerializer(vendor).data,
            'invoices': invoice_data,
            'summary': {
                'total_invoiced': str(total_invoiced),
                'total_paid': str(total_paid),
                'outstanding': str(total_invoiced - total_paid),
            },
        })


# ─── Product Type ─────────────────────────────────────

class ProductTypeListCreateView(APIView):
    def get(self, request):
        return Response(ProductTypeSerializer(ProductType.objects.all(), many=True).data)

    def post(self, request):
        serializer = ProductTypeSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProductTypeDetailView(APIView):
    def _get(self, pk):
        try:
            return ProductType.objects.get(pk=pk)
        except ProductType.DoesNotExist:
            return None

    def put(self, request, pk):
        obj = self._get(pk)
        if not obj:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProductTypeSerializer(obj, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        obj = self._get(pk)
        if not obj:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Product ──────────────────────────────────────────

class ProductListCreateView(APIView):
    def get(self, request):
        qs = Product.objects.select_related('product_type').all()
        name = request.query_params.get('name')
        if name:
            qs = qs.filter(product_name__icontains=name)
        return Response(ProductSerializer(qs, many=True).data)

    def post(self, request):
        serializer = ProductSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProductDetailView(APIView):
    def _get(self, pk):
        return Product.objects.select_related('product_type').filter(pk=pk).first()

    def get(self, request, pk):
        product = self._get(pk)
        if not product:
            return Response({'error': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(ProductSerializer(product).data)

    def put(self, request, pk):
        product = self._get(pk)
        if not product:
            return Response({'error': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProductSerializer(product, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(ProductSerializer(self._get(pk)).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        product = self._get(pk)
        if not product:
            return Response({'error': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)
        product.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Inventory ────────────────────────────────────────

class InventoryListView(APIView):
    def get(self, request):
        low_stock = request.query_params.get('low_stock', None)
        inventory = Inventory.objects.select_related('product__product_type').all()
        if low_stock:
            inventory = [i for i in inventory if i.is_low_stock]
        return Response(InventorySerializer(inventory, many=True).data)


class InventoryDetailView(APIView):
    def get_object(self, pk):
        try:
            return Inventory.objects.get(pk=pk)
        except Inventory.DoesNotExist:
            return None

    def get(self, request, pk):
        inventory = self.get_object(pk)
        if not inventory:
            return Response({'error': 'Inventory not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(InventorySerializer(inventory).data)

    def put(self, request, pk):
        inventory = self.get_object(pk)
        if not inventory:
            return Response({'error': 'Inventory not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = InventorySerializer(inventory, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─── Invoice ──────────────────────────────────────────

class InvoiceListCreateView(APIView):
    def get(self, request):
        invoices = (
            Invoice.objects
            .select_related('vendor')
            .prefetch_related('items__product', 'payments')
            .all()
        )
        return Response(InvoiceSerializer(invoices, many=True).data)

    def post(self, request):
        logger.info("Vendor invoice create requested | vendor=%s items=%s",
                    request.data.get('vendor'), len(request.data.get('items') or []))
        serializer = InvoiceCreateSerializer(data=request.data)
        if serializer.is_valid():
            with transaction.atomic():
                invoice = serializer.save()
            logger.info("Vendor invoice created | id=%s number=%s vendor_id=%s total=%s",
                        invoice.id, invoice.invoice_number, invoice.vendor_id, invoice.total_amount)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        logger.warning("Vendor invoice create validation failed | errors=%s", serializer.errors)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class InvoiceDetailView(APIView):
    def _get_invoice(self, pk):
        return (
            Invoice.objects
            .prefetch_related('items__product', 'payments')
            .filter(pk=pk)
            .select_related('vendor')
            .first()
        )

    def get(self, request, pk):
        invoice = self._get_invoice(pk)
        if not invoice:
            return Response({'error': 'Invoice not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(InvoiceSerializer(invoice).data)

    def put(self, request, pk):
        try:
            invoice = Invoice.objects.get(pk=pk)
        except Invoice.DoesNotExist:
            return Response({'error': 'Invoice not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = InvoiceCreateSerializer(invoice, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class InvoiceItemDeleteView(APIView):
    def delete(self, request, pk):
        try:
            item = InvoiceItem.objects.get(pk=pk)
        except InvoiceItem.DoesNotExist:
            return Response({'error': 'Invoice item not found'}, status=status.HTTP_404_NOT_FOUND)
        try:
            inv = Inventory.objects.get(
                product=item.product,
                brand=item.product_brand or '',
                unit_amount=item.unit_amount,
                cost_price=item.unit_price,
            )
            inv.quantity_available -= item.quantity
            inv.save()
        except Inventory.DoesNotExist:
            pass
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Invoice Payments ─────────────────────────────────

class InvoicePaymentListCreateView(APIView):
    def _get_invoice(self, invoice_pk):
        return (
            Invoice.objects
            .prefetch_related('payments')
            .filter(pk=invoice_pk)
            .first()
        )

    def get(self, request, invoice_pk):
        invoice = self._get_invoice(invoice_pk)
        if not invoice:
            return Response({'error': 'Invoice not found'}, status=status.HTTP_404_NOT_FOUND)
        payments = invoice.payments.all().order_by('payment_date', 'created_at')
        return Response(InvoicePaymentSerializer(payments, many=True).data)

    def post(self, request, invoice_pk):
        invoice = self._get_invoice(invoice_pk)
        if not invoice:
            logger.warning("Invoice payment failed: invoice not found | invoice_id=%s", invoice_pk)
            return Response({'error': 'Invoice not found'}, status=status.HTTP_404_NOT_FOUND)

        serializer = InvoicePaymentSerializer(data=request.data)
        if not serializer.is_valid():
            logger.warning("Invoice payment validation failed | invoice=%s errors=%s",
                           invoice.invoice_number, serializer.errors)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        amount = serializer.validated_data['amount']
        if amount <= Decimal('0'):
            logger.warning("Invoice payment rejected: non-positive amount | invoice=%s amount=%s",
                           invoice.invoice_number, amount)
            return Response({'amount': ['Amount must be greater than 0.']}, status=status.HTTP_400_BAD_REQUEST)

        outstanding = invoice.outstanding_amount
        if amount > outstanding:
            logger.warning("Invoice payment rejected: exceeds outstanding | invoice=%s amount=%s outstanding=%s",
                           invoice.invoice_number, amount, outstanding)
            return Response(
                {'amount': [f'Amount exceeds outstanding balance of ₹{outstanding}.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payment = serializer.save(invoice=invoice)
        logger.info("Invoice payment recorded | invoice=%s amount=%s method=%s remaining=%s",
                    invoice.invoice_number, amount,
                    serializer.validated_data.get('payment_method'), outstanding - amount)

        # Return fresh invoice with all payments for receipt generation
        refreshed = (
            Invoice.objects
            .select_related('vendor')
            .prefetch_related('items__product', 'payments')
            .get(pk=invoice.pk)
        )
        return Response({
            'payment': InvoicePaymentSerializer(payment).data,
            'invoice': InvoiceSerializer(refreshed).data,
        }, status=status.HTTP_201_CREATED)
