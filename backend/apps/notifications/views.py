from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Notification
from .serializers import NotificationSerializer


class NotificationListView(APIView):
    def get(self, request):
        qs = Notification.objects.all()
        status_filter = request.query_params.get('status')
        trigger       = request.query_params.get('trigger_type')
        if status_filter:
            qs = qs.filter(status=status_filter)
        if trigger:
            qs = qs.filter(trigger_type=trigger)
        return Response(NotificationSerializer(qs[:200], many=True).data)
