from django.db import models


class Notification(models.Model):
    CHANNEL_CHOICES = [('whatsapp', 'WhatsApp')]
    STATUS_CHOICES  = [('pending', 'Pending'), ('sent', 'Sent'), ('failed', 'Failed')]
    TRIGGER_CHOICES = [
        ('job_checkin',            'Job Check-in'),
        ('job_completed',          'Job Completed'),
        ('payment_received',       'Payment Received'),
        ('customer_welcome',       'Customer Welcome'),
        ('garage_payment',         'Garage Payment'),
        ('service_reminder',       'Service Reminder'),
        ('service_due_today',      'Service Due Today'),
        ('garage_all_completed',   'Garage All Completed'),
        ('low_stock_alert',        'Low Stock Alert'),
        ('salary_processed',       'Salary Processed'),
        ('member_absent',          'Member Absent'),
    ]

    recipient_name  = models.CharField(max_length=255)
    recipient_phone = models.CharField(max_length=20)
    channel         = models.CharField(max_length=20, choices=CHANNEL_CHOICES, default='whatsapp')
    trigger_type    = models.CharField(max_length=50, choices=TRIGGER_CHOICES)
    message         = models.TextField()
    status          = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    retry_count     = models.PositiveIntegerField(default=0)
    error_log       = models.TextField(blank=True, default='')
    created_at      = models.DateTimeField(auto_now_add=True)
    sent_at         = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.trigger_type} → {self.recipient_name} [{self.status}]"
