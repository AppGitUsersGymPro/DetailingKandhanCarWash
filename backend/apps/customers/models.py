import re

from django.db import models


def normalize_phone(value):
    if not value:
        return ''
    digits = re.sub(r'\D', '', str(value))
    if len(digits) > 10 and digits.startswith('91'):
        digits = digits[2:]
    return digits


# Create your models here.
class Customer(models.Model):
    customer_name = models.CharField(max_length=255)
    phone_number = models.CharField(max_length=20, unique=True)
    email = models.EmailField(unique = True)

    def save(self, *args, **kwargs):
        self.phone_number = normalize_phone(self.phone_number)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.customer_name
    
class CustomerAsset(models.Model):
    VEHICLE_TYPE=[
        ('two_wheeler', 'Two Wheeler'),
        ('four_wheeler', 'Four Wheeler'),
        ('three_wheeler', 'Three Wheeler'),
        ('other', 'Other'),
    ]
    customer = models.ForeignKey(Customer, related_name='vehicles', on_delete=models.CASCADE)
    vehicle_number = models.CharField(max_length=50, unique=True)
    vehicle_name = models.CharField(max_length=255)
    vehicle_type = models.CharField(max_length=20, choices=VEHICLE_TYPE, default='other')

    def __str__(self):
        return f"{self.customer.customer_name} - {self.vehicle_name}"
    
