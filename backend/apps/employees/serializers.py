from rest_framework import serializers
from django.db.models import Sum
from decimal import Decimal
from .models import Employee, Shift, Attendance, SalaryAdvance, SalaryTransaction


# ── Shift ─────────────────────────────────────────────────────────────────────

class ShiftSerializer(serializers.ModelSerializer):
    # Read-only helper so the frontend can show "Mon, Tue, Wed" without parsing
    working_day_names = serializers.ListField(read_only=True)

    class Meta:
        model = Shift
        fields = '__all__'


# ── Employee ──────────────────────────────────────────────────────────────────

class EmployeeSerializer(serializers.ModelSerializer):
    shift_name    = serializers.CharField(source='shift.shift_name', read_only=True)
    # Not required on create — backend auto-generates EMP{id:03d} when blank
    employee_code = serializers.CharField(required=False, allow_blank=True, default='')

    class Meta:
        model = Employee
        fields = '__all__'


# ── Attendance ────────────────────────────────────────────────────────────────

class AttendanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.employee_name', read_only=True)

    class Meta:
        model = Attendance
        fields = '__all__'


# ── Salary Advance ────────────────────────────────────────────────────────────

class SalaryAdvanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.employee_name', read_only=True)

    class Meta:
        model = SalaryAdvance
        fields = '__all__'

    def validate(self, data):
        employee = data.get('employee')
        amount   = data.get('amount')
        if not employee or not amount:
            return data

        # Sum all pending + approved advances (unsettled) for this employee
        qs = SalaryAdvance.objects.filter(employee=employee, status__in=['pending', 'approved'])
        if self.instance:                        # exclude self on update
            qs = qs.exclude(pk=self.instance.pk)
        outstanding = qs.aggregate(total=Sum('amount'))['total'] or Decimal('0')

        if outstanding + Decimal(str(amount)) > employee.salary:
            raise serializers.ValidationError({
                'amount': (
                    f'Total outstanding advances (₹{outstanding + Decimal(str(amount))}) '
                    f'would exceed the monthly salary (₹{employee.salary}). '
                    f'Already outstanding: ₹{outstanding}.'
                )
            })
        return data


# ── Salary Transaction ────────────────────────────────────────────────────────

class SalaryTransactionSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.employee_name', read_only=True)
    # Return "May 2026" string for display
    month_display = serializers.SerializerMethodField()

    class Meta:
        model = SalaryTransaction
        # net_paid is auto-computed in model.save() — make it read-only here
        fields = '__all__'
        read_only_fields = ['net_paid']

    def get_month_display(self, obj):
        return obj.month.strftime('%B %Y') if obj.month else ''

    def validate(self, data):
        base   = float(data.get('base_salary',       0))
        bonus  = float(data.get('bonus',             0))
        deduct = float(data.get('advance_deduction', 0))
        if base + bonus - deduct < 0:
            raise serializers.ValidationError(
                {'advance_deduction': 'Advance deduction cannot exceed salary plus bonus.'}
            )
        return data