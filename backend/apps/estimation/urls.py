# urls.py
from django.urls import path
from .views import EstimationListCreateView, EstimationDetailView, EstimationPublicView

urlpatterns = [
    path('', EstimationListCreateView.as_view(), name='estimation-list'),
    # Public estimate (no auth — for WhatsApp share links)
    path('public/<uuid:share_token>/', EstimationPublicView.as_view(), name='estimation-public'),
    path('<int:pk>/', EstimationDetailView.as_view(), name='estimation-detail'),
]