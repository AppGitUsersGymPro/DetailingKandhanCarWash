# views.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from .models import Estimation
from .serializers import EstimationSerializer


class EstimationPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


class EstimationListCreateView(APIView):
    def get(self, request):
        qs = Estimation.objects.prefetch_related('items').all()
        paginator = EstimationPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = EstimationSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = EstimationSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class EstimationDetailView(APIView):
    def get(self, request, pk):
        try:
            est = Estimation.objects.prefetch_related('items').get(pk=pk)
        except Estimation.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(EstimationSerializer(est).data)

    def delete(self, request, pk):
        try:
            est = Estimation.objects.get(pk=pk)
        except Estimation.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        est.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Public Estimate View (no auth) ───────────────────────────────────────────
class EstimationPublicView(APIView):
    permission_classes     = [AllowAny]
    authentication_classes = []

    def get(self, request, share_token):
        try:
            est = Estimation.objects.prefetch_related('items').get(share_token=share_token)
        except Estimation.DoesNotExist:
            return Response({'error': 'Estimate not found'}, status=status.HTTP_404_NOT_FOUND)

        from apps.site_settings.models import Setting
        biz_keys = ['business_name', 'business_phone', 'business_address', 'business_gst_number']
        biz_map  = {s.field_name: s.value for s in Setting.objects.filter(field_name__in=biz_keys)}

        return Response({
            'estimation': EstimationSerializer(est).data,
            'business': {
                'name':       biz_map.get('business_name',       ''),
                'phone':      biz_map.get('business_phone',      ''),
                'address':    biz_map.get('business_address',    ''),
                'gst_number': biz_map.get('business_gst_number', ''),
            },
        })