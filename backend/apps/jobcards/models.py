import uuid
from decimal import Decimal
from django.db import models
from django.utils import timezone

VEHICLE_SUB_TYPE_CHOICES = [
    ('sedan',               'Sedan'),
    ('compact_suv',         'Compact SUV'),
    ('suv',                 'SUV'),
    ('hatchback',           'Hatchback'),
    ('four_wheeler_others', '4-Wheeler Others'),
]


class JobCard(models.Model):
    STATUS_CHOICES = [
        ('IN_PROGRESS', 'In Progress'),
        ('COMPLETED', 'Completed'),
    ]
    job_card_number = models.CharField(max_length=255, unique=True, blank=True)
    customer_asset = models.ForeignKey('customers.CustomerAsset', on_delete=models.PROTECT)
    job_card_date = models.DateField()
    vehicle_kilometers = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    vehicle_entry_time = models.DateTimeField()
    vehicle_exit_time = models.DateTimeField(blank=True, null=True)
    vehicle_expected_exit_time = models.DateTimeField(blank=True, null=True)
    job_card_status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='IN_PROGRESS')
    complaints = models.TextField(blank=True, null=True)
    gst_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('18.00'))
    employee         = models.ForeignKey('employees.Employee', on_delete=models.PROTECT)
    vehicle_sub_type = models.CharField(max_length=20, choices=VEHICLE_SUB_TYPE_CHOICES, blank=True, null=True)
    garage_owner     = models.ForeignKey('customers.GarageOwner', on_delete=models.PROTECT, blank=True, null=True, related_name='job_cards')
    base_amount  = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    gst_amount   = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    total_amount = models.DecimalField(max_digits = 10, decimal_places = 2, blank = True , null = True)
    share_token  = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    def save(self, *args, **kwargs):
        if not self.job_card_number:
            year = (self.job_card_date or timezone.now().date()).year
            prefix = f'JC-{year}-'
            existing = JobCard.objects.filter(
                job_card_number__startswith=prefix
            ).values_list('job_card_number', flat=True)
            nums = []
            for num in existing:
                try:
                    nums.append(int(num[len(prefix):]))
                except (ValueError, IndexError):
                    pass
            next_num = (max(nums) + 1) if nums else 1
            self.job_card_number = f'{prefix}{next_num:03d}'
        super().save(*args, **kwargs)

    def __str__(self):
        return self.job_card_number
    
    class Meta:
        ordering = ['-job_card_date', '-vehicle_entry_time']
    
class JobCardService(models.Model):
    SERVICE_STATUS = [
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
    ]
    job_card = models.ForeignKey(JobCard, related_name='job_card_services', on_delete=models.CASCADE)
    service = models.ForeignKey('services.Service', on_delete=models.PROTECT)
    price_at_time = models.DecimalField(max_digits=10, decimal_places=2)
    service_status = models.CharField(max_length=20, choices=SERVICE_STATUS, default='pending')
    
    def __str__(self):
        return f"{self.job_card.job_card_number} - {self.service.service_name}"

class JobCardEmployee(models.Model):
    job_card_service = models.ForeignKey(JobCardService, on_delete=models.CASCADE, related_name='employees')
    employee = models.ForeignKey('employees.Employee', on_delete=models.PROTECT)

    def __str__(self):
        return f"{self.job_card_service.job_card.job_card_number} - {self.employee.employee_name}"


class JobCardPayment(models.Model):
    PAYMENT_METHOD_CHOICES = [
        ('cash',       'Cash'),
        ('upi',        'UPI'),
        ('card',       'Card'),
        ('netbanking', 'Net Banking'),
        ('cheque',     'Cheque'),
        ('other',      'Other'),
    ]
    job_card       = models.ForeignKey(JobCard, related_name='payments', on_delete=models.CASCADE)
    amount         = models.DecimalField(max_digits=10, decimal_places=2)
    gst_collected  = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    base_collected = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    payment_date   = models.DateField()
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, default='cash')
    notes          = models.TextField(blank=True)
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-payment_date', '-created_at']

    def __str__(self):
        return f"Payment ₹{self.amount} for {self.job_card.job_card_number}"

class JobCardProduct(models.Model): # This model represents the products used for a specific service in a job card
    job_card_service = models.ForeignKey(JobCardService, on_delete=models.CASCADE, related_name='products')
    service_product = models.ForeignKey("services.ServiceProduct", on_delete= models.CASCADE)

    def __str__(self):
        return f"{self.job_card_service.job_card.job_card_number} - {self.service_product.product.product_name}"

class JobCardProductUsage(models.Model): # This model represents the actual usage of a product for a specific service in a job card. It allows tracking the quantity of each product used. Main purpose is to reduce the quantity of the product from inventory when the job card is completed.
    job_card_product = models.ForeignKey(JobCardProduct, on_delete= models.CASCADE, related_name="usages")
    product = models.ForeignKey('vendors.Inventory' , on_delete=models.PROTECT)
    quantity_used = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f"{self.job_card_product.job_card_service.job_card.job_card_number}  - {self.quantity_used}"


class SalesOrder(models.Model):
    """Standalone retail sale — not tied to any job card."""
    PAYMENT_METHOD_CHOICES = [
        ('cash', 'Cash'), ('upi', 'UPI'), ('card', 'Card'),
        ('netbanking', 'Net Banking'), ('cheque', 'Cheque'), ('other', 'Other'),
    ]
    order_number   = models.CharField(max_length=255, unique=True, blank=True)
    customer       = models.ForeignKey('customers.Customer', on_delete=models.SET_NULL, null=True, blank=True, related_name='sales_orders')
    customer_name  = models.CharField(max_length=255)
    phone_number   = models.CharField(max_length=20, blank=True)
    sale_date      = models.DateField()
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, default='cash')
    notes          = models.TextField(blank=True)
    created_at     = models.DateTimeField(auto_now_add=True)
    total_amount   = models.DecimalField(max_digits=10, decimal_places= 2, default = 0.0)
    share_token    = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    def save(self, *args, **kwargs):
        if not self.order_number:
            year = (self.sale_date or timezone.now().date()).year
            prefix = f'SO-{year}-'
            existing = SalesOrder.objects.filter(
                order_number__startswith=prefix
            ).values_list('order_number', flat=True)
            nums = []
            for n in existing:
                try:
                    nums.append(int(n[len(prefix):]))
                except (ValueError, IndexError):
                    pass
            self.order_number = f'{prefix}{(max(nums) + 1 if nums else 1):03d}'
        super().save(*args, **kwargs)

    def __str__(self):
        return self.order_number


class SalesOrderItem(models.Model):
    """Line item for a SalesOrder (decrements inventory on create)."""
    sales_order = models.ForeignKey(SalesOrder, related_name='items', on_delete=models.CASCADE)
    inventory   = models.ForeignKey('vendors.Inventory', on_delete=models.PROTECT)
    quantity    = models.DecimalField(max_digits=10, decimal_places=2)
    unit_price  = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f"{self.sales_order.order_number} – {self.inventory.product.product_name}"


class JobCardSalesProduct(models.Model):
    """Retail product sold directly on this job card (category='sales' inventory items)."""
    job_card   = models.ForeignKey(JobCard, related_name='sales_products', on_delete=models.CASCADE)
    inventory  = models.ForeignKey('vendors.Inventory', on_delete=models.PROTECT)
    quantity   = models.DecimalField(max_digits=10, decimal_places=2)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)  # selling_price snapshot
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.job_card.job_card_number} - {self.inventory.product.product_name} x{self.quantity}"


