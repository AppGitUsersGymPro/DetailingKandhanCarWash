from django.db import models
from django.contrib.auth.models import User


class Setting(models.Model):
    CATEGORY_FINANCIAL   = 'financial'
    CATEGORY_BUSINESS    = 'business'
    CATEGORY_INCENTIVE   = 'incentive'
    CATEGORY_OPERATIONS  = 'operations'

    CATEGORY_CHOICES = [
        (CATEGORY_FINANCIAL,  'Financial'),
        (CATEGORY_BUSINESS,   'Business Info'),
        (CATEGORY_INCENTIVE,  'Staff & Incentive'),
        (CATEGORY_OPERATIONS, 'Operations'),
    ]

    FIELD_TYPE_CHOICES = [
        ('text',     'Text'),
        ('number',   'Number'),
        ('percent',  'Percent'),
        ('email',    'Email'),
        ('tel',      'Phone'),
        ('textarea', 'Textarea'),
        ('select',   'Select'),
    ]

    field_name  = models.CharField(max_length=100, unique=True)
    label       = models.CharField(max_length=255)
    value       = models.TextField(default='')
    category    = models.CharField(max_length=50, choices=CATEGORY_CHOICES, default=CATEGORY_FINANCIAL)
    field_type  = models.CharField(max_length=20, choices=FIELD_TYPE_CHOICES, default='text')
    # comma-separated option list used when field_type == 'select'
    options     = models.TextField(blank=True, default='')
    description = models.TextField(blank=True, default='')
    sort_order  = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['category', 'sort_order', 'id']

    def __str__(self):
        return f'{self.field_name} = {self.value}'


class UserProfile(models.Model):
    ROLE_ADMIN = 'admin'
    ROLE_STAFF = 'staff'
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('staff', 'Staff'),
    ]

    user     = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role     = models.CharField(max_length=20, choices=ROLE_CHOICES, default='admin')
    # Nullable: None = "common" login (shared), set = mapped to a specific employee (1 login per employee)
    employee = models.OneToOneField(
        'employees.Employee',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='user_profile',
    )

    @property
    def display_name(self):
        if self.employee_id:
            return self.employee.employee_name
        return self.user.username

    def __str__(self):
        return f'{self.user.username} ({self.role})'
