from django.urls import path
from .views import (
    SettingListView, ChangePasswordView,
    StaffUserListCreateView, StaffUserDetailView,
    AvailableEmployeesView,
)

urlpatterns = [
    path('', SettingListView.as_view(), name='setting-list'),
    path('change-password/', ChangePasswordView.as_view(), name='change-password'),
    path('staff-users/', StaffUserListCreateView.as_view(), name='staff-user-list'),
    path('staff-users/<int:pk>/', StaffUserDetailView.as_view(), name='staff-user-detail'),
    path('available-employees/', AvailableEmployeesView.as_view(), name='available-employees'),
]
