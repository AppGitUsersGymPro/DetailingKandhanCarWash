from django.urls import path
from .views import (
    FetchProductsUsedForJobCard, JobCardListCreateView, JobCardDetailView, FullJobCardCreateView,
    JobCardServiceListCreateView, JobCardServiceDeleteView,
    JobCardEmployeeListCreateView, JobCardEmployeeDeleteView,
    FetchVehicleType, FetchVehicleTypeList,
    JobCardPaymentListCreateView, JobCardPaymentDeleteView,
    JobCardProductInventoryOptionsView,
    JobCardProductUsageListCreateView,
    JobCardProductUsageDeleteView,
    CustomerAnalyticsView,
    CustomerTiersView,
    CustomerReportView,
    SalesInventoryListView,
    JobCardSalesProductListCreateView,
    JobCardSalesProductDeleteView,
    SalesOrderListCreateView,
    SalesOrderDeleteView,
    SalesAnalyticsView,
    GarageJobCardGroupView,
    GaragePaymentView,
    JobCardPublicInvoiceView,
    SalesOrderPublicView,
)

urlpatterns = [
    # JobCard
    path('', JobCardListCreateView.as_view(), name='jobcard-list'),
    path('create-full/', FullJobCardCreateView.as_view(), name='jobcard-create-full'),
    path('<int:pk>/', JobCardDetailView.as_view(), name='jobcard-detail'),

    # JobCard Services
    path('<int:jobcard_pk>/services/', JobCardServiceListCreateView.as_view(), name='jobcard-service-list'),
    path('services/<int:pk>/', JobCardServiceDeleteView.as_view(), name='jobcard-service-delete'),

    # JobCard Employees
    path('services/<int:jcservice_pk>/employees/', JobCardEmployeeListCreateView.as_view(), name='jobcard-employee-list'),
    path('services/employees/<int:pk>/', JobCardEmployeeDeleteView.as_view(), name='jobcard-employee-delete'),

    # JobCard Payments
    path('<int:jobcard_pk>/payments/', JobCardPaymentListCreateView.as_view(), name='jobcard-payment-list'),
    path('payments/<int:pk>/', JobCardPaymentDeleteView.as_view(), name='jobcard-payment-delete'),

    path('by-vehicle/<str:vehicle_type>/', FetchVehicleType.as_view(), name='jobcard-by-vehicle-type'),
    path('by-vehicle/<str:vehicle_type>/list/', FetchVehicleTypeList.as_view(), name='jobcard-list-by-vehicle-type'),

    path('<int:jobcard_pk>/products-used/', FetchProductsUsedForJobCard.as_view(), name='jobcard-products-used'),

    # JobCardProduct → inventory options + usage records
    path('products/<int:jc_product_id>/inventory-options/', JobCardProductInventoryOptionsView.as_view(), name='jcproduct-inventory-options'),
    path('products/<int:jc_product_id>/usages/', JobCardProductUsageListCreateView.as_view(), name='jcproduct-usage-list-create'),
    path('usages/<int:pk>/', JobCardProductUsageDeleteView.as_view(), name='jcproduct-usage-delete'),

    # Analytics
    path('customer-analytics/', CustomerAnalyticsView.as_view(), name='customer-analytics'),
    path('customer-tiers/',     CustomerTiersView.as_view(),     name='customer-tiers'),
    path('customer-report/',    CustomerReportView.as_view(),    name='customer-report'),

    # Sales Products (job-card linked)
    path('sales-inventory/',                        SalesInventoryListView.as_view(),              name='sales-inventory-list'),
    path('<int:jobcard_pk>/sales-products/',         JobCardSalesProductListCreateView.as_view(),   name='jobcard-sales-product-list'),
    path('sales-products/<int:pk>/',                JobCardSalesProductDeleteView.as_view(),        name='jobcard-sales-product-delete'),

    # Standalone Sales Orders
    path('sales-orders/',            SalesOrderListCreateView.as_view(), name='sales-order-list'),
    path('sales-orders/<int:pk>/',   SalesOrderDeleteView.as_view(),     name='sales-order-delete'),
    path('sales-analytics/',         SalesAnalyticsView.as_view(),       name='sales-analytics'),

    # Garage groups
    path('garage-groups/',   GarageJobCardGroupView.as_view(), name='garage-groups'),
    path('garage-payments/', GaragePaymentView.as_view(),      name='garage-payments'),

    # Public invoices (no auth — for WhatsApp share links)
    path('public/<uuid:share_token>/',       JobCardPublicInvoiceView.as_view(), name='jobcard-public-invoice'),
    path('sales-public/<uuid:share_token>/', SalesOrderPublicView.as_view(),     name='salesorder-public-invoice'),
]