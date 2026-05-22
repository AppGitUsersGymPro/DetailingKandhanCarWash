from decimal import Decimal
from django.db import models


class JobCard(models.Model):
    STATUS_CHOICES = [
        ('IN_PROGRESS', 'In Progress'),
        ('COMPLETED', 'Completed'),
    ]
    job_card_number = models.CharField(max_length=255, unique=True)
    customer_asset = models.ForeignKey('customers.CustomerAsset', on_delete=models.PROTECT)
    job_card_date = models.DateField()
    vehicle_kilometers = models.DecimalField(max_digits=10, decimal_places=2)
    vehicle_entry_time = models.DateTimeField()
    vehicle_exit_time = models.DateTimeField(blank=True, null=True)
    vehicle_expected_exit_time = models.DateTimeField(blank=True, null=True)
    job_card_status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='IN_PROGRESS')
    complaints = models.TextField(blank=True, null=True)
    gst_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('18.00'))

    def __str__(self):
        return self.job_card_number
    
class JobCardService(models.Model):
    job_card = models.ForeignKey(JobCard, related_name='job_card_services', on_delete=models.CASCADE)
    service = models.ForeignKey('services.Service', on_delete=models.PROTECT)
    price_at_time = models.DecimalField(max_digits=10, decimal_places=2)
    
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


