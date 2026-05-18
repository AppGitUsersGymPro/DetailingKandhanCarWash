from django.db import models

# Create your models here.
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


