import re

from django.db import models



VEHICLE_SUB_TYPE_CHOICES = [
    ('sedan',               'Sedan'),
    ('compact_suv',         'Compact SUV'),
    ('suv',                 'SUV'),
    ('hatchback',           'Hatchback'),
    ('four_wheeler_others', '4-Wheeler Others'),
]

    
def normalize_phone(value):
    if not value:
        return ''
    digits = re.sub(r'\D', '', str(value))
    if len(digits) > 10 and digits.startswith('91'):
        digits = digits[2:]
    return digits


class VehicleCompany(models.Model):
    """Lookup table for vehicle makes/brands."""
    name = models.CharField(max_length=255)
    vehicle_type = models.CharField(max_length=50, blank=True, default='')

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class VehicleModel(models.Model):
    """Lookup table for vehicle models (linked to a company by name)."""
    name = models.CharField(max_length=255)
    company_name = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class VehicleColour(models.Model):
    """Lookup table for vehicle colours."""
    name = models.CharField(max_length=255, unique=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class GarageOwner(models.Model):
    """A garage / workshop that sends vehicles for servicing."""
    name         = models.CharField(max_length=255)              # contact person
    garage_name  = models.CharField(max_length=255)              # business name
    location     = models.TextField(blank=True, default='')
    gstin        = models.CharField(max_length=50, blank=True, default='')
    phone_number = models.CharField(max_length=20, unique=True)
    email        = models.EmailField(blank=True, null=True)
    notes        = models.TextField(blank=True, default='')

    def __str__(self):
        return self.garage_name


class Customer(models.Model):
    customer_name = models.CharField(max_length=255, blank = True, null = True)
    phone_number  = models.CharField(max_length=20, unique=True)
    email         = models.EmailField(unique=True, blank=True, null=True)
    garage_owner  = models.ForeignKey(
        GarageOwner, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='proxy_customers',
    )

    def save(self, *args, **kwargs):
        self.phone_number = normalize_phone(self.phone_number)
        if not self.email:
            self.email = None
        super().save(*args, **kwargs)

    def __str__(self):
        return self.phone_number
    
class CustomerAsset(models.Model):
    VEHICLE_TYPE=[
        ('two_wheeler', 'Two Wheeler'),
        ('four_wheeler', 'Four Wheeler'),
        ('three_wheeler', 'Three Wheeler'),
        ('other', 'Other'),
    ]
    customer = models.ForeignKey(Customer, related_name='vehicles', on_delete=models.CASCADE)
    vehicle_number = models.CharField(max_length=50, unique=True)
    vehicle_name = models.CharField(max_length=255, blank=True, default='')
    vehicle_company = models.CharField(max_length=255, blank=True, default='')
    vehicle_model = models.CharField(max_length=255, blank=True, default='')
    vehicle_colour = models.CharField(max_length=255, blank=True, default='')
    vehicle_type = models.CharField(max_length=20, choices=VEHICLE_TYPE, default='other')
    vehicle_sub_type = models.CharField(max_length=20, choices=VEHICLE_SUB_TYPE_CHOICES, blank=True, default='')
    last_service_date = models.DateField(null=True, blank=True)
    next_service_date = models.DateField(null=True, blank=True)

    def __str__(self):
        parts = [p for p in [self.vehicle_company, self.vehicle_model, self.vehicle_colour] if p]
        display = ' '.join(parts) or self.vehicle_name or self.vehicle_number
        return f"{self.customer.customer_name} - {display}"
    
