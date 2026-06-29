from rest_framework import serializers
from django.db.models import Sum
from decimal import Decimal
from .models import Employee, Shift, Attendance, SalaryAdvance, SalaryTransaction, IncentiveSetting
from apps.finance.models import Expense

# ── Shift ─────────────────────────────────────────────────────────────────────

class ShiftSerializer(serializers.ModelSerializer):
    # Read-only helper so the frontend can show "Mon, Tue, Wed" without parsing
    working_day_names = serializers.ListField(read_only=True)

    class Meta:
        model = Shift
        fields = '__all__'


# ── Employee ──────────────────────────────────────────────────────────────────

class EmployeeSerializer(serializers.ModelSerializer):
    shift_name       = serializers.CharField(source='shift.shift_name',   read_only=True)
    shift_start_time = serializers.TimeField(source='shift.start_time',   read_only=True)
    # Not required on create — backend auto-generates EMP{id:03d} when blank
    employee_code    = serializers.CharField(required=False, allow_blank=True, default='')

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
    salary_month_display = serializers.SerializerMethodField()

    class Meta:
        model = SalaryAdvance
        fields = '__all__'

    def get_salary_month_display(self, obj):
        return obj.salary_month.strftime('%B %Y') if obj.salary_month else ''

    def validate(self, data):
        employee = data.get('employee')
        amount   = data.get('amount')
        if not employee or not amount:
            return data

        # Sum all pending + approved advances for the same salary_month (unsettled)
        salary_month = data.get('salary_month')
        qs = SalaryAdvance.objects.filter(employee=employee, status__in=['pending', 'approved'])
        if salary_month:
            qs = qs.filter(salary_month=salary_month)
        if self.instance:
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
    
    def create(self, validated_data):
        txn = SalaryAdvance.objects.create(**validated_data)
        Expense.objects.create(
            amount = txn.amount,
            customer = txn.employee.employee_name,
            date = txn.date,
            category = "advance",
            reference = txn.id,
            description = txn.employee.id,
        )
        return txn
    
    def update(self, instance, validated_data):
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        Expense.objects.filter(
            reference = instance.employee.id,
            category = "advance",
        ).update(
            amount = instance.amount,
            customer = instance.employee.employee_name,
            date = instance.date,
            category = "advance",
            reference = instance.id,
            description = instance.employee.id,
        )
        return instance


# ── Salary Transaction ────────────────────────────────────────────────────────

class SalaryTransactionSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.employee_name', read_only=True)
    # Return "May 2026" string for display
    month_display = serializers.SerializerMethodField()

    class Meta:
        model = SalaryTransaction
        fields = '__all__'
        read_only_fields = ['net_paid']

    def get_month_display(self, obj):
        return obj.month.strftime('%B %Y') if obj.month else ''

    def validate(self, data):
        base      = Decimal(str(data.get('base_salary',       0) or 0))
        bonus     = Decimal(str(data.get('bonus',             0) or 0))
        incentive = Decimal(str(data.get('incentive',         0) or 0))
        deduct    = Decimal(str(data.get('advance_deduction', 0) or 0))
        if base + bonus + incentive - deduct < 0:
            raise serializers.ValidationError(
                {'advance_deduction': 'Advance deduction cannot exceed salary plus bonus plus incentive.'}
            )
        return data
    def create(self, validated_data):
        txn = SalaryTransaction.objects.create(**validated_data)
        Expense.objects.create(
            amount = txn.net_paid,
            customer = txn.employee.employee_name,
            date = txn.payment_date,
            category = "salary",
            reference = txn.employee.id,
            description = txn.notes,
        )
        return txn
    
    def update(self, instance, validated_data):
        for field, value in validated_data.items():
            setattr(instance,field,value)
        instance.save()

        Expense.objects.filter(
            reference = instance.employee.id,
            category = 'salary',
        ).update(
            amount = instance.net_paid,
            customer = instance.employee.employee_name,
            date = instance.payment_date,
            category = "salary",
            reference = instance.employee.id,
            description = instance.notes,
        )
        return instance

# ── Incentive Setting ─────────────────────────────────────────────────────────

class IncentiveSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model  = IncentiveSetting
        fields = '__all__'
