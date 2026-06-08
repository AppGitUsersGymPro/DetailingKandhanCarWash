from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Notification
        fields = [
            'id', 'recipient_name', 'recipient_phone', 'channel',
            'trigger_type', 'message', 'status', 'retry_count',
            'error_log', 'created_at', 'sent_at',
        ]
        read_only_fields = fields
