from decimal import Decimal
from django.db import models
from django.utils import timezone

class JobCard(models.Model):
    STATUS_CHOICES = [
        ('IN_PROGRESS', 'In Progress'),
        ('COMPLETED', 'Completed'),
    ]
    job_card_number = models.CharField(max_length=255, unique=True, blank=True)
    customer_asset = models.ForeignKey('customers.CustomerAsset', on_delete=models.PROTECT)
    job_card_date = models.DateField()
    vehicle_kilometers = models.DecimalField(max_digits=10, decimal_places=2)
    vehicle_entry_time = models.DateTimeField()
    vehicle_exit_time = models.DateTimeField(blank=True, null=True)
    vehicle_expected_exit_time = models.DateTimeField(blank=True, null=True)
    job_card_status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='IN_PROGRESS')
    complaints = models.TextField(blank=True, null=True)
    gst_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('18.00'))
    employee = models.ForeignKey('employees.Employee', on_delete=models.PROTECT, blank=True, null=True)  # Optional field to track the employee responsible for the job card

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


