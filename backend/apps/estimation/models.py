import uuid
from django.db import models
from apps.services.models import Service

# Create your models here.
class Estimation(models.Model):
    VEHICLE_TYPE = [
        ("two_wheeler","Two Wheeler"),
        ("three_wheeler", "Three Wheeler"),
        ("four_wheeler", "Four Wheeler"),
        ("others", "Others"),
    ]
    SUB_TYPE = [
        ("suv", "SUV"),
        ("compact_suv", "CompactSUV"),
        ("sedan", "Sedan"),
        ("hatchback", "Hatchback"),
        ("others", "Others"),
    ]
    customer_name = models.CharField(max_length=255, blank=False, null=False)
    customer_phone_number = models.CharField(max_length=10, blank= False, null=False)
    vehicle_name = models.CharField(max_length=255)
    vehicle_company= models.CharField(max_length=255, blank=False, null = True)
    vehicle_model = models.CharField(max_length=255, blank=True, null=True)
    vehicle_colour = models.CharField(max_length=255, blank=True, null=True)
    vehicle_type = models.CharField(max_length=255, choices=VEHICLE_TYPE, blank=False, null=False)
    vehicle_sub_type = models.CharField(max_length=255, choices=SUB_TYPE,blank=False, null=False)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    # Opaque public identifier for the WhatsApp share link (no auth required).
    share_token = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)

    class Meta:
        ordering = ['-created_at']


class EstimationItem(models.Model):
    estimation    = models.ForeignKey(Estimation, related_name='items', on_delete=models.CASCADE)
    service_name  = models.CharField(max_length=255)
    amount        = models.DecimalField(max_digits=10, decimal_places=2)
    selected_service= models.ForeignKey(Service, on_delete = models.CASCADE, null=True, blank=True)

    def __str__(self):
        return f"{self.service_name} — ₹{self.amount}"