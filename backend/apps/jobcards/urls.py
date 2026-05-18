from django.urls import path
from .views import (
    JobCardListCreateView, JobCardDetailView, FullJobCardCreateView,
    JobCardServiceListCreateView, JobCardServiceDeleteView,
    JobCardEmployeeListCreateView, JobCardEmployeeDeleteView
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
]