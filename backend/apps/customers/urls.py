from django.urls import path
from .views import (
    CustomerAssetDetailView, CustomerListView, CustomerDetailView, CustomerAssetListView,
    VehicleFetchView, CustomerFetchView, AllVehiclesListView,
    VehicleCompanyListView, VehicleModelListView, VehicleColourListView,
    GarageOwnerListCreateView, GarageOwnerDetailView,ChangeCustomerView,
)

urlpatterns = [
    path('', CustomerListView.as_view(), name='customer-list'),
    path('<int:pk>/', CustomerDetailView.as_view(), name='customer-detail'),
    path('<int:customer_pk>/assets/', CustomerAssetListView.as_view(), name='customer-asset-list'),
    path('assets/<int:pk>/', CustomerAssetDetailView.as_view(), name='customer-asset-detail'),
    path('assets/<str:vehicle_number>/change-customer/', ChangeCustomerView.as_view(), name='change-customer-for-asset'),
    path('check-vehicle/', VehicleFetchView.as_view(), name='customer-asset-by-vehicle-number'),
    path('check-customer/', CustomerFetchView.as_view(), name='customer-by-phone-number'),
    # All vehicles across all customers
    path('vehicles/', AllVehiclesListView.as_view(), name='all-vehicles'),
    # Vehicle lookup tables
    path('vehicle-companies/', VehicleCompanyListView.as_view(), name='vehicle-company-list'),
    path('vehicle-models/', VehicleModelListView.as_view(), name='vehicle-model-list'),
    path('vehicle-colours/', VehicleColourListView.as_view(), name='vehicle-colour-list'),
    # Garage owners
    path('garages/', GarageOwnerListCreateView.as_view(), name='garage-owner-list'),
    path('garages/<int:pk>/', GarageOwnerDetailView.as_view(), name='garage-owner-detail'),
]