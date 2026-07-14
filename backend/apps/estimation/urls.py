# urls.py
from django.urls import path
from .views import EstimationListCreateView, EstimationDetailView

urlpatterns = [
    path('', EstimationListCreateView.as_view(), name='estimation-list'),
    path('<int:pk>/', EstimationDetailView.as_view(), name='estimation-detail'),
]