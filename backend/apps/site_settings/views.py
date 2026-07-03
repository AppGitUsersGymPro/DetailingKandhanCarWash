import logging
from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import BasePermission
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import Setting, UserProfile
from .serializers import SettingSerializer

logger = logging.getLogger(__name__)


# ── Permission ────────────────────────────────────────────────────────────────

class IsAdminRole(BasePermission):
    def has_permission(self, request, view):
        profile = getattr(request.user, 'profile', None)
        if profile is None and request.user.is_superuser:
            return True
        return profile is not None and profile.role == UserProfile.ROLE_ADMIN


# ── Custom login — returns role + employee info ───────────────────────────────

class CustomTokenObtainPairView(TokenObtainPairView):
    def post(self, request, *args, **kwargs):
        username = request.data.get('username', '')
        logger.info("Login attempt | username=%s", username)
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            try:
                user = User.objects.select_related('profile__employee').get(username=username)
                profile = getattr(user, 'profile', None)
                if profile is None:
                    role = 'admin' if (user.is_superuser or user.is_staff) else 'staff'
                    profile = UserProfile.objects.create(user=user, role=role)
                response.data['role'] = profile.role
                if profile.employee_id:
                    response.data['employee_id']   = profile.employee_id
                    response.data['employee_name'] = profile.employee.employee_name
                else:
                    response.data['employee_id']   = None
                    response.data['employee_name'] = None
                logger.info("Login success | username=%s role=%s employee_id=%s",
                            username, response.data['role'], response.data['employee_id'])
            except User.DoesNotExist:
                response.data['role']          = 'admin'
                response.data['employee_id']   = None
                response.data['employee_name'] = None
                logger.info("Login success | username=%s role=admin (no profile)", username)
        else:
            logger.warning("Login failed | username=%s status=%s", username, response.status_code)
        return response


# ── Settings ──────────────────────────────────────────────────────────────────

class SettingListView(APIView):
    def get(self, request):
        return Response(SettingSerializer(Setting.objects.all(), many=True).data)

    def patch(self, request):
        updated = []
        errors  = {}
        for field_name, value in request.data.items():
            try:
                s = Setting.objects.get(field_name=field_name)
                s.value = str(value)
                s.save()
                updated.append(SettingSerializer(s).data)
            except Setting.DoesNotExist:
                errors[field_name] = 'Unknown setting key'
        if errors:
            return Response({'updated': updated, 'errors': errors},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response(updated)


class ChangePasswordView(APIView):
    def post(self, request):
        old = request.data.get('old_password', '').strip()
        new = request.data.get('new_password', '').strip()

        if not old or not new:
            return Response({'error': 'Both current and new passwords are required.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if len(new) < 8:
            return Response({'error': 'New password must be at least 8 characters.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if not request.user.check_password(old):
            return Response({'error': 'Current password is incorrect.'},
                            status=status.HTTP_400_BAD_REQUEST)

        request.user.set_password(new)
        request.user.save()
        return Response({'message': 'Password updated successfully.'})


# ── Available employees (not yet mapped to a login) ───────────────────────────

class AvailableEmployeesView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        from apps.employees.models import Employee
        # Exclude employees that already have a profile linked
        exclude_pk = request.query_params.get('exclude_profile')  # used when editing
        qs = Employee.objects.filter(
            status='active',
            user_profile__isnull=True,
        ).order_by('employee_name')
        if exclude_pk:
            try:
                profile = UserProfile.objects.get(pk=exclude_pk)
                if profile.employee_id:
                    qs = Employee.objects.filter(
                        status='active'
                    ).exclude(
                        user_profile__isnull=False
                    ).exclude(
                        pk=profile.employee_id
                    ).union(
                        Employee.objects.filter(pk=profile.employee_id)
                    ).order_by('employee_name')
            except UserProfile.DoesNotExist:
                pass
        return Response([
            {'id': e.id, 'employee_name': e.employee_name, 'employee_code': e.employee_code}
            for e in qs
        ])


# ── Staff user management (admin only) ───────────────────────────────────────

def _serialize_staff(user):
    profile = user.profile
    return {
        'id':            user.id,
        'username':      user.username,
        'role':          profile.role,
        'is_active':     user.is_active,
        'employee_id':   profile.employee_id,
        'employee_name': profile.employee.employee_name if profile.employee_id else None,
        'employee_code': profile.employee.employee_code if profile.employee_id else None,
    }


class StaffUserListCreateView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        staff = (
            User.objects
            .filter(profile__role=UserProfile.ROLE_STAFF)
            .select_related('profile__employee')
        )
        return Response([_serialize_staff(u) for u in staff])

    def post(self, request):
        username    = request.data.get('username', '').strip()
        password    = request.data.get('password', '').strip()
        employee_id = request.data.get('employee_id')  # None = "common"

        # Username validations
        if not username:
            return Response({'error': 'Username is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if username.lower() == 'admin':
            return Response(
                {'error': '"admin" is a reserved username and cannot be used for staff accounts.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not password:
            return Response({'error': 'Password is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(password) < 6:
            return Response({'error': 'Password must be at least 6 characters.'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(username=username).exists():
            return Response({'error': 'Username already taken.'}, status=status.HTTP_400_BAD_REQUEST)

        # Employee validation
        employee = None
        if employee_id:
            from apps.employees.models import Employee
            try:
                employee = Employee.objects.get(pk=employee_id)
            except Employee.DoesNotExist:
                return Response({'error': 'Employee not found.'}, status=status.HTTP_400_BAD_REQUEST)
            if UserProfile.objects.filter(employee=employee).exists():
                return Response(
                    {'error': f'{employee.employee_name} already has a login credential.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        try:
            with transaction.atomic():
                user    = User.objects.create_user(username=username, password=password)
                profile = UserProfile.objects.create(user=user, role=UserProfile.ROLE_STAFF, employee=employee)
        except IntegrityError:
            # Concurrent request beat us to the same username or employee mapping
            if User.objects.filter(username=username).exists():
                return Response({'error': 'Username already taken.'}, status=status.HTTP_400_BAD_REQUEST)
            if employee and UserProfile.objects.filter(employee=employee).exists():
                return Response(
                    {'error': f'{employee.employee_name} already has a login credential.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response({'error': 'Could not create account. Please try again.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(_serialize_staff(user), status=status.HTTP_201_CREATED)


class StaffUserDetailView(APIView):
    permission_classes = [IsAdminRole]

    def _get_staff(self, pk):
        try:
            return User.objects.select_related('profile__employee').get(
                pk=pk, profile__role=UserProfile.ROLE_STAFF
            )
        except User.DoesNotExist:
            return None

    def patch(self, request, pk):
        user = self._get_staff(pk)
        if not user:
            return Response({'error': 'Staff user not found.'}, status=status.HTTP_404_NOT_FOUND)

        new_password = request.data.get('password', '').strip()
        if new_password:
            if len(new_password) < 6:
                return Response({'error': 'Password must be at least 6 characters.'}, status=status.HTTP_400_BAD_REQUEST)
            user.set_password(new_password)
            user.save()

        return Response(_serialize_staff(user))

    def delete(self, request, pk):
        user = self._get_staff(pk)
        if not user:
            return Response({'error': 'Staff user not found.'}, status=status.HTTP_404_NOT_FOUND)
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
