from django.urls import path
from .views import CustomerAssetDetailView, CustomerListView, CustomerDetailView, CustomerAssetListView, VehicleFetchView, CustomerFetchView
urlpatterns = [
    path('',CustomerListView.as_view(), name='customer-list'),
    path('<int:pk>/',CustomerDetailView.as_view(), name='customer-detail'),
    path('<int:customer_pk>/assets/', CustomerAssetListView.as_view(), name='customer-asset-list'),
    path('assets/<int:pk>/', CustomerAssetDetailView.as_view(), name='customer-asset-detail'),
    path('check-vehicle/', VehicleFetchView.as_view(), name='customer-asset-by-vehicle-number'),
    path('check-customer/', CustomerFetchView.as_view(), name='customer-by-phone-number'),
]