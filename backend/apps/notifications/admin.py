from django.contrib import admin
from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display  = ('trigger_type', 'recipient_name', 'recipient_phone', 'status', 'created_at', 'sent_at')
    list_filter   = ('status', 'trigger_type', 'channel')
    search_fields = ('recipient_name', 'recipient_phone', 'message')
    readonly_fields = ('created_at', 'sent_at', 'retry_count', 'error_log')
    ordering      = ('-created_at',)
