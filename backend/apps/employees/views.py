import logging
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from datetime import date, datetime
from decimal import Decimal
import calendar
from django.utils import timezone as tz

from .models import Employee, Shift, Attendance, SalaryAdvance, SalaryTransaction, IncentiveSetting

logger = logging.getLogger(__name__)
from .serializers import (
    EmployeeSerializer, ShiftSerializer, AttendanceSerializer,
    SalaryAdvanceSerializer, SalaryTransactionSerializer, IncentiveSettingSerializer,
)
from django.db import transaction
from apps.finance.models import Expense


# ── Shared helper ─────────────────────────────────────────────────────────────

def get_or_404(model, pk):
    try:
        return model.objects.get(pk=pk)
    except model.DoesNotExist:
        return None


# ── Employee ──────────────────────────────────────────────────────────────────

class EmployeeListView(APIView):
    #permission_classes = [AllowAny]
    def get(self, request):
        qs = Employee.objects.select_related('shift').all()
        if request.query_params.get('name'):
            qs = qs.filter(employee_name__icontains=request.query_params['name'])
        serializer = EmployeeSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        logger.info("Employee create requested | name=%s", request.data.get('employee_name'))
        serializer = EmployeeSerializer(data=request.data)
        if serializer.is_valid():
            employee = serializer.save()
            logger.info("Employee created | id=%s name=%s code=%s",
                        employee.id, employee.employee_name, employee.employee_code)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        logger.warning("Employee create validation failed | errors=%s", serializer.errors)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class EmployeeDetailView(APIView):
    #permission_classes = [AllowAny]
    def get_object(self, pk):
        try:
            return Employee.objects.select_related('shift').get(pk=pk)
        except Employee.DoesNotExist:
            return None

    def get(self, request, pk):
        employee = self.get_object(pk)
        if not employee:
            return Response({'error': 'Employee not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(EmployeeSerializer(employee).data)

    def put(self, request, pk):
        employee = self.get_object(pk)
        if not employee:
            return Response({'error': 'Employee not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = EmployeeSerializer(employee, data=request.data)
        if serializer.is_valid():
            serializer.save()
            logger.info("Employee updated | id=%s name=%s code=%s",
                        employee.id, employee.employee_name, employee.employee_code)
            return Response(serializer.data)
        logger.warning("Employee update validation failed | id=%s errors=%s", pk, serializer.errors)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        employee = self.get_object(pk)
        if not employee:
            return Response({'error': 'Employee not found'}, status=status.HTTP_404_NOT_FOUND)
        logger.info("Employee deleted | id=%s name=%s code=%s",
                    employee.id, employee.employee_name, employee.employee_code)
        employee.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Shift ─────────────────────────────────────────────────────────────────────

class ShiftListView(APIView):
    #permission_classes = [AllowAny]
    def get(self, request):
        shifts = Shift.objects.all()
        return Response(ShiftSerializer(shifts, many=True).data)

    def post(self, request):
        logger.info("Shift create requested | name=%s", request.data.get('shift_name'))
        serializer = ShiftSerializer(data=request.data)
        if serializer.is_valid():
            shift = serializer.save()
            logger.info("Shift created | id=%s name=%s", shift.id, shift.shift_name)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        logger.warning("Shift create validation failed | errors=%s", serializer.errors)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ShiftDetailView(APIView):
    #permission_classes = [AllowAny]
    def get(self, request, pk):
        obj = get_or_404(Shift, pk)
        if not obj:
            return Response({'error': 'Shift not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(ShiftSerializer(obj).data)

    def put(self, request, pk):
        obj = get_or_404(Shift, pk)
        if not obj:
            return Response({'error': 'Shift not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ShiftSerializer(obj, data=request.data)
        if serializer.is_valid():
            serializer.save()
            logger.info("Shift updated | id=%s name=%s", obj.id, obj.shift_name)
            return Response(serializer.data)
        logger.warning("Shift update validation failed | id=%s errors=%s", pk, serializer.errors)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        obj = get_or_404(Shift, pk)
        if not obj:
            return Response({'error': 'Shift not found'}, status=status.HTTP_404_NOT_FOUND)
        logger.info("Shift deleted | id=%s name=%s", obj.id, obj.shift_name)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Attendance ────────────────────────────────────────────────────────────────

class AttendanceListView(APIView):
    #permission_classes = [AllowAny]
    def get(self, request):
        qs = Attendance.objects.select_related('employee').all()
        p = request.query_params
        # Filter by employee, month, year, or specific date
        if p.get('employee'):
            qs = qs.filter(employee_id=p['employee'])
        if p.get('month') and p.get('year'):
            qs = qs.filter(date__month=p['month'], date__year=p['year'])
        if p.get('date'):
            qs = qs.filter(date=p['date'])
        return Response(AttendanceSerializer(qs, many=True).data)

    def post(self, request):
        logger.info("Attendance create requested | employee=%s date=%s status=%s",
                    request.data.get('employee'), request.data.get('date'),
                    request.data.get('status'))
        serializer = AttendanceSerializer(data=request.data)
        if serializer.is_valid():
            record = serializer.save()
            logger.info("Attendance recorded | id=%s employee_id=%s date=%s status=%s",
                        record.id, record.employee_id, record.date, record.status)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        logger.warning("Attendance validation failed | errors=%s", serializer.errors)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AttendanceDetailView(APIView):
    #permission_classes = [AllowAny]
    def get(self, request, pk):
        obj = get_or_404(Attendance, pk)
        if not obj:
            return Response({'error': 'Attendance not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(AttendanceSerializer(obj).data)

    def put(self, request, pk):
        obj = get_or_404(Attendance, pk)
        if not obj:
            return Response({'error': 'Attendance not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = AttendanceSerializer(obj, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        obj = get_or_404(Attendance, pk)
        if not obj:
            return Response({'error': 'Attendance not found'}, status=status.HTTP_404_NOT_FOUND)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Salary Advance ────────────────────────────────────────────────────────────

class SalaryAdvanceListView(APIView):
    #permission_classes = [AllowAny]
    def get(self, request):
        qs = SalaryAdvance.objects.select_related('employee').all()
        p = request.query_params
        if p.get('employee'):
            qs = qs.filter(employee_id=p['employee'])
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('salary_month'):
            qs = qs.filter(salary_month=p['salary_month'])
        try:
            limit = int(p['limit']) if p.get('limit') else None
        except (ValueError, TypeError):
            limit = None
        if limit:
            qs = qs[:limit]
        return Response(SalaryAdvanceSerializer(qs, many=True).data)

    def post(self, request):
        logger.info("Salary advance create requested | employee=%s amount=%s",
                    request.data.get('employee'), request.data.get('amount'))
        serializer = SalaryAdvanceSerializer(data=request.data)
        if serializer.is_valid():
            with transaction.atomic():
                advance = serializer.save()
                logger.info("Salary advance recorded | id=%s employee_id=%s amount=%s salary_month=%s",
                            advance.id, advance.employee_id, advance.amount, advance.salary_month)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
        logger.warning("Salary advance validation failed | errors=%s", serializer.errors)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SalaryAdvanceDetailView(APIView):
    #permission_classes = [AllowAny]
    def get(self, request, pk):
        obj = get_or_404(SalaryAdvance, pk)
        if not obj:
            return Response({'error': 'Advance not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(SalaryAdvanceSerializer(obj).data)

    def put(self, request, pk):
        obj = get_or_404(SalaryAdvance, pk)
        if not obj:
            return Response({'error': 'Advance not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = SalaryAdvanceSerializer(obj, data=request.data)
        if serializer.is_valid():
            with transaction.atomic():
                serializer.save()
                return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        obj = get_or_404(SalaryAdvance, pk)
        if not obj:
            return Response({'error': 'Advance not found'}, status=status.HTTP_404_NOT_FOUND)
        with transaction.atomic():
            Expense.objects.filter(
                reference=obj.employee.id,
                category='advance',
            ).delete()
            obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Salary Transaction ────────────────────────────────────────────────────────

class SalaryTransactionListView(APIView):
    #permission_classes = [AllowAny]
    def get(self, request):
        qs = SalaryTransaction.objects.select_related('employee').all()
        p = request.query_params
        if p.get('employee'):
            qs = qs.filter(employee_id=p['employee'])
        if p.get('month'):
            qs = qs.filter(month__month=p['month'])
        if p.get('year'):
            qs = qs.filter(month__year=p['year'])
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        try:
            limit = int(p['limit']) if p.get('limit') else None
        except (ValueError, TypeError):
            limit = None
        if limit:
            qs = qs[:limit]
        return Response(SalaryTransactionSerializer(qs, many=True).data)

    def post(self, request):
        logger.info("Salary payment create requested | employee=%s month=%s",
                    request.data.get('employee'), request.data.get('month'))
        serializer = SalaryTransactionSerializer(data=request.data)
        if serializer.is_valid():
            with transaction.atomic():
                txn = serializer.save()

            logger.info("Salary payment recorded | id=%s employee_id=%s month=%s net_paid=%s",
                        txn.id, txn.employee_id, txn.month, txn.net_paid)

            try:
                from apps.notifications.utils import queue_notification, _get_business_name
                emp = txn.employee
                if emp.employee_phone_number:
                    queue_notification(
                        recipient_name=emp.employee_name,
                        phone=emp.employee_phone_number,
                        trigger_type='salary_processed',
                        amount=f"{txn.net_paid:,.2f}",
                        month=txn.month.strftime('%B %Y'),
                        business_name=_get_business_name(),
                    )
                    logger.info("Salary processed notification queued | transaction=%s employee=%s",
                                txn.id, emp.employee_name)
            except Exception:
                logger.exception(
                    "salary_processed notification failed for transaction %s", txn.id
                )

            return Response(serializer.data, status=status.HTTP_201_CREATED)
        logger.warning("Salary payment validation failed | errors=%s", serializer.errors)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SalaryTransactionDetailView(APIView):
    #permission_classes = [AllowAny]
    def get(self, request, pk):
        obj = get_or_404(SalaryTransaction, pk)
        if not obj:
            return Response({'error': 'Transaction not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(SalaryTransactionSerializer(obj).data)

    def put(self, request, pk):
        obj = get_or_404(SalaryTransaction, pk)
        if not obj:
            return Response({'error': 'Transaction not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = SalaryTransactionSerializer(obj, data=request.data)
        if serializer.is_valid():
            with transaction.atomic():
                serializer.save()
                return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        obj = get_or_404(SalaryTransaction, pk)
        if not obj:
            return Response({'error': 'Transaction not found'}, status=status.HTTP_404_NOT_FOUND)
        with transaction.atomic():
            Expense.objects.filter(
                reference=obj.employee.id,
                category='salary',
            ).delete()
            obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Salary Compute (attendance-based) ────────────────────────────────────────
# Off-days are paid time-off: total_scheduled = ALL calendar days × shift_mins.
# Off-day hours are auto-credited unless an absent/leave record exists for that day.
# worked_minutes already includes overtime (check_out − check_in raw), and already
# excludes late time (late arrival means less worked time). Adding OT or subtracting
# late on top of worked_minutes would double-count both.
# billable_mins = max(0, worked + off_day_credit)
# hours_pct     = billable_mins / total_scheduled_mins × 100
# computed      = base_salary × hours_pct / 100

class SalaryComputeView(APIView):
    def get(self, request):
        emp_id = request.query_params.get('employee')
        month  = request.query_params.get('month')
        year   = request.query_params.get('year')
        if not emp_id or not month or not year:
            return Response({'error': 'employee, month, year required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            emp = Employee.objects.select_related('shift').get(pk=emp_id)
        except Employee.DoesNotExist:
            return Response({'error': 'Employee not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            month_int = int(month)
            year_int  = int(year)
        except (ValueError, TypeError):
            return Response({'error': 'Invalid month or year'}, status=status.HTTP_400_BAD_REQUEST)
        shift = emp.shift

        if not shift:
            return Response({
                'no_shift': True,
                'employee_name': emp.employee_name,
                'base_salary': str(emp.salary),
                'computed_salary': str(emp.salary),
                'total_scheduled_mins': 0,
                'total_worked_mins': 0,
                'total_late_mins': 0,
                'total_ot_mins': 0,
                'off_day_credit_mins': 0,
                'billable_mins': 0,
                'hours_pct': 100.0,
                'working_days_in_month': 0,
                'shift_hours_per_day': 0,
            })

        # Shift duration in minutes
        start_dt           = datetime.combine(date.today(), shift.start_time)
        end_dt             = datetime.combine(date.today(), shift.end_time)
        shift_mins_per_day = int((end_dt - start_dt).total_seconds() / 60)

        days_in_month      = calendar.monthrange(year_int, month_int)[1]
        working_days_count = sum(
            1 for d in range(1, days_in_month + 1)
            if date(year_int, month_int, d).weekday() in shift.working_days_list
        )

        # Total scheduled = ALL calendar days (working + off) × shift_mins
        total_scheduled_mins = days_in_month * shift_mins_per_day

        # Build a map of date → status for records in this month
        records        = list(Attendance.objects.filter(employee=emp, date__month=month_int, date__year=year_int))
        record_map     = {r.date: r for r in records}
        today_date     = tz.localdate()
        ABSENT_STATUSES = {'absent', 'auto_absent'}
        LEAVE_STATUSES  = {'leave'}

        total_worked_mins = 0
        total_late_mins   = 0
        total_ot_mins     = 0
        off_day_credit_mins = 0

        for d_num in range(1, days_in_month + 1):
            d   = date(year_int, month_int, d_num)
            rec = record_map.get(d)
            is_working_day = d.weekday() in shift.working_days_list

            if is_working_day:
                # Working day: use actual attendance record
                if rec:
                    if rec.worked_minutes > 0:
                        total_worked_mins += rec.worked_minutes
                    elif rec.status == 'half_day':
                        total_worked_mins += shift_mins_per_day // 2
                    total_late_mins += rec.late_minutes
                    total_ot_mins   += rec.overtime_minutes
            else:
                # Off-day: auto-credit full shift unless leave/absent was explicitly recorded
                if d <= today_date:
                    if rec and rec.status in ABSENT_STATUSES | LEAVE_STATUSES:
                        pass  # explicit leave on off-day — no credit
                    else:
                        off_day_credit_mins += shift_mins_per_day

        # Core formula — OT and late are already baked into worked_minutes
        billable_mins = max(0, total_worked_mins + off_day_credit_mins)
        if total_scheduled_mins > 0:
            hours_pct = round(billable_mins / total_scheduled_mins * 100, 1)
        else:
            hours_pct = 100.0

        computed_salary = (
            Decimal(str(emp.salary)) * Decimal(str(hours_pct)) / Decimal('100')
        ).quantize(Decimal('0.01'))

        return Response({
            'no_shift': False,
            'employee_name': emp.employee_name,
            'base_salary': str(emp.salary),
            'computed_salary': str(computed_salary),
            'total_scheduled_mins': total_scheduled_mins,
            'total_worked_mins': total_worked_mins,
            'total_late_mins': total_late_mins,
            'total_ot_mins': total_ot_mins,
            'off_day_credit_mins': off_day_credit_mins,
            'billable_mins': billable_mins,
            'hours_pct': hours_pct,
            'working_days_in_month': working_days_count,
            'shift_hours_per_day': round(shift_mins_per_day / 60, 2),
        })


# ── Employee Calendar (GymCRM-style per-employee monthly view) ────────────────

class EmployeeCalendarView(APIView):
    def get(self, request, pk):
        try:
            emp = Employee.objects.select_related('shift').get(pk=pk)
        except Employee.DoesNotExist:
            return Response({'error': 'Employee not found'}, status=status.HTTP_404_NOT_FOUND)

        today = tz.localdate()
        try:
            year_int  = int(request.query_params.get('year',  today.year))
            month_int = int(request.query_params.get('month', today.month))
        except (ValueError, TypeError):
            return Response({'error': 'Invalid year or month'}, status=status.HTTP_400_BAD_REQUEST)

        days_in_month = calendar.monthrange(year_int, month_int)[1]
        records       = Attendance.objects.filter(
            employee=emp, date__year=year_int, date__month=month_int
        ).order_by('date')
        record_map = {r.date: r for r in records}
        shift      = emp.shift

        working_days_in_month = sum(
            1 for d_num in range(1, days_in_month + 1)
            if (shift.is_working_day(date(year_int, month_int, d_num)) if shift else True)
        )

        days_data = []
        for d_num in range(1, days_in_month + 1):
            d   = date(year_int, month_int, d_num)
            rec = record_map.get(d)
            days_data.append({
                'date':           str(d),
                'day':            d_num,
                'weekday':        d.weekday(),   # 0=Mon … 6=Sun — used directly as grid padding
                'is_working_day': shift.is_working_day(d) if shift else True,
                'is_today':       d == today,
                'is_future':      d > today,
                'record':         AttendanceSerializer(rec).data if rec else None,
            })

        counts = {
            'present': 0, 'absent': 0, 'half_day': 0, 'leave': 0,
            'late': 0, 'overtime': 0, 'late_overtime': 0, 'auto_absent': 0,
            'total_worked_mins': 0, 'total_late_mins': 0, 'total_ot_mins': 0,
            'working_days_in_month': working_days_in_month,
        }
        for rec in records:
            s = rec.status
            if s in counts:
                counts[s] = counts[s] + 1
            counts['total_worked_mins'] += rec.worked_minutes
            counts['total_late_mins']   += rec.late_minutes
            counts['total_ot_mins']     += rec.overtime_minutes

        return Response({
            'employee': EmployeeSerializer(emp).data,
            'shift':    ShiftSerializer(shift).data if shift else None,
            'year':     year_int,
            'month':    month_int,
            'counts':   counts,
            'days':     days_data,
        })


# ── Auto Checkout ─────────────────────────────────────────────────────────────
# Closes any today's records that have check_in but no check_out.
# Sets check_out = shift end time (or now if shift has not ended yet).
# Attendance.save() then recomputes worked/late/OT automatically.

class AttendanceAutoCheckoutView(APIView):
    def post(self, request):
        today    = tz.localdate()
        now_time = tz.localtime(tz.now()).time().replace(second=0, microsecond=0)

        pending = Attendance.objects.filter(
            date=today,
            check_in__isnull=False,
            check_out__isnull=True,
        ).select_related('employee__shift')

        updated = []
        for record in pending:
            shift = record.employee.shift
            if shift:
                # Use shift end time if we are past it; otherwise use now
                checkout_time = shift.end_time if now_time >= shift.end_time else now_time
            else:
                checkout_time = now_time

            record.check_out = checkout_time
            record.save()   # recomputes worked_mins, late_mins, overtime_mins, status
            updated.append({
                'employee_name': record.employee.employee_name,
                'check_in':      record.check_in.strftime('%H:%M'),
                'check_out':     record.check_out.strftime('%H:%M'),
                'status':        record.status,
                'worked_minutes':   record.worked_minutes,
                'overtime_minutes': record.overtime_minutes,
            })

        logger.info("Attendance auto-checkout run | date=%s records_closed=%s", today, len(updated))
        return Response({'updated': len(updated), 'records': updated})


# ── Kiosk Lookup (confirm step before marking attendance) ─────────────────────

class AttendanceKioskLookupView(APIView):
    def post(self, request):
        emp_code = request.data.get('employee_code', '').strip().upper()
        if not emp_code:
            return Response({'error': 'Employee code is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            emp = Employee.objects.select_related('shift').get(employee_code=emp_code)
        except Employee.DoesNotExist:
            return Response({'error': f'No employee found with code "{emp_code}"'}, status=status.HTTP_404_NOT_FOUND)

        today = tz.localdate()
        try:
            record = Attendance.objects.get(employee=emp, date=today)
        except Attendance.DoesNotExist:
            record = None

        if record is None:
            next_action = 'check_in'
        elif record.check_out is None:
            next_action = 'check_out'
        else:
            next_action = 'update_checkout'

        return Response({
            'employee_id':   emp.id,
            'employee_name': emp.employee_name,
            'employee_code': emp.employee_code,
            'employee_type': emp.employee_type,
            'emp_status':    emp.status,
            'shift_name':    emp.shift.shift_name if emp.shift else None,
            'next_action':   next_action,
            'check_in_time':  record.check_in.strftime('%H:%M')  if record and record.check_in  else None,
            'check_out_time': record.check_out.strftime('%H:%M') if record and record.check_out else None,
        })


# ── Kiosk (employee self check-in / check-out) ────────────────────────────────

class AttendanceKioskView(APIView):
    def post(self, request):
        emp_code = request.data.get('employee_code', '').strip().upper()
        if not emp_code:
            logger.warning("Kiosk attendance rejected: missing employee code")
            return Response({'error': 'Employee code is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            emp = Employee.objects.select_related('shift').get(employee_code=emp_code)
        except Employee.DoesNotExist:
            logger.warning("Kiosk attendance rejected: unknown employee code | code=%s", emp_code)
            return Response({'error': f'No employee found with code "{emp_code}"'}, status=status.HTTP_404_NOT_FOUND)

        today    = tz.localdate()
        now_time = tz.localtime(tz.now()).time().replace(second=0, microsecond=0)

        is_late = False
        if emp.shift and emp.shift.start_time:
            from datetime import timedelta as _td
            grace_end = (datetime.combine(date.today(), emp.shift.start_time) +
                         _td(minutes=emp.shift.late_grace_minutes)).time()
            is_late = now_time > grace_end

        try:
            record = Attendance.objects.get(employee=emp, date=today)
        except Attendance.DoesNotExist:
            record = None

        if record is None:
            att_status = 'late' if is_late else 'present'
            Attendance.objects.create(
                employee=emp, date=today, status=att_status,
                check_in=now_time, check_out=None,
            )
            logger.info("Kiosk check-in | employee=%s code=%s time=%s status=%s",
                        emp.employee_name, emp.employee_code, now_time.strftime('%H:%M'), att_status)
            return Response({
                'action': 'checked_in',
                'employee_name': emp.employee_name,
                'employee_code': emp.employee_code,
                'time': now_time.strftime('%H:%M'),
                'status': att_status,
                'message': f'{"Late check-in" if is_late else "Checked in"} at {now_time.strftime("%H:%M")}',
            })

        if record.check_out is None:
            record.check_out = now_time
            record.save()
            logger.info("Kiosk check-out | employee=%s code=%s time=%s status=%s",
                        emp.employee_name, emp.employee_code, now_time.strftime('%H:%M'), record.status)
            return Response({
                'action': 'checked_out',
                'employee_name': emp.employee_name,
                'employee_code': emp.employee_code,
                'time': now_time.strftime('%H:%M'),
                'status': record.status,
                'message': f'Checked out at {now_time.strftime("%H:%M")}',
            })

        # Third+ scan: update check-out time
        record.check_out = now_time
        record.save()
        logger.info("Kiosk check-out updated | employee=%s code=%s time=%s status=%s",
                    emp.employee_name, emp.employee_code, now_time.strftime('%H:%M'), record.status)
        return Response({
            'action': 'checkout_updated',
            'employee_name': emp.employee_name,
            'employee_code': emp.employee_code,
            'time': now_time.strftime('%H:%M'),
            'status': record.status,
            'message': f'Check-out updated to {now_time.strftime("%H:%M")}',
        })


# ── Incentive Settings ────────────────────────────────────────────────────────

class IncentiveSettingView(APIView):
    def get(self, request):
        obj = IncentiveSetting.get_settings()
        return Response(IncentiveSettingSerializer(obj).data)

    def put(self, request):
        obj = IncentiveSetting.get_settings()
        serializer = IncentiveSettingSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ── Incentive Compute ─────────────────────────────────────────────────────────
# Counts job-card services the employee worked on in the given month.
# Fixed: (orders_above_threshold) × fixed_amount_per_order
# Percent: salary × incentive_salary_percent / 100  (if threshold met)

class IncentiveComputeView(APIView):
    def get(self, request):
        from apps.site_settings.models import Setting

        emp_id = request.query_params.get('employee')
        month  = request.query_params.get('month')
        year   = request.query_params.get('year')
        if not emp_id or not month or not year:
            return Response({'error': 'employee, month, year required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            month_int = int(month)
            year_int  = int(year)
        except (ValueError, TypeError):
            return Response({'error': 'Invalid month or year'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            emp = Employee.objects.get(pk=emp_id)
        except Employee.DoesNotExist:
            return Response({'error': 'Employee not found'}, status=status.HTTP_404_NOT_FOUND)

        from apps.jobcards.models import JobCard
        order_count = JobCard.objects.filter(
            employee_id=emp_id,
            job_card_date__year=year_int,
            job_card_date__month=month_int,
        ).count()

        def _s(key, default='0'):
            try:
                return Setting.objects.get(field_name=key).value or default
            except Setting.DoesNotExist:
                return default

        order_threshold        = int(_s('incentive_order_threshold', '10'))
        incentive_type         = _s('incentive_type', 'fixed')
        incentive_fixed_amount = Decimal(_s('incentive_fixed_amount', '0'))
        incentive_salary_pct   = Decimal(_s('incentive_salary_percent', '0'))

        threshold_met = order_count >= order_threshold
        orders_above  = max(0, order_count - order_threshold)

        if not threshold_met:
            incentive_amount = Decimal('0.00')
        elif incentive_type == 'fixed':
            incentive_amount = (Decimal(str(orders_above)) * incentive_fixed_amount).quantize(Decimal('0.01'))
        else:
            incentive_amount = (Decimal(str(emp.salary)) * incentive_salary_pct / Decimal('100')).quantize(Decimal('0.01'))

        return Response({
            'order_count':              order_count,
            'order_threshold':          order_threshold,
            'orders_above_threshold':   orders_above,
            'incentive_type':           incentive_type,
            'incentive_fixed_amount':   str(incentive_fixed_amount),
            'incentive_salary_percent': str(incentive_salary_pct),
            'incentive_amount':         str(incentive_amount),
            'setting_amount':           str(incentive_amount),
            'threshold_met':            threshold_met,
        })


# ── Employee Performance Dashboard ───────────────────────────────────────────
# Per-employee order count + revenue vs targets fetched from site_settings.

class EmployeePerformanceDashboardView(APIView):
    def get(self, request):
        from apps.jobcards.models import JobCard, JobCardService
        from apps.site_settings.models import Setting
        from django.db.models import Sum

        today = date.today()
        try:
            month_int = int(request.query_params.get('month', today.month))
            year_int  = int(request.query_params.get('year',  today.year))
        except (ValueError, TypeError):
            return Response({'error': 'Invalid month or year'}, status=status.HTTP_400_BAD_REQUEST)

        def _s(key, default='0'):
            try:
                return Setting.objects.get(field_name=key).value or default
            except Setting.DoesNotExist:
                return default

        order_threshold      = int(_s('incentive_order_threshold', '10'))
        revenue_target       = Decimal(_s('monthly_revenue_target', '0'))
        incentive_type       = _s('incentive_type', 'fixed')
        incentive_fixed_amt  = Decimal(_s('incentive_fixed_amount', '0'))
        incentive_salary_pct = Decimal(_s('incentive_salary_percent', '0'))

        employees = Employee.objects.filter(status='active').order_by('employee_name')

        emp_data = []
        for emp in employees:
            # Count job cards directly assigned to this employee
            service_count = JobCard.objects.filter(
                employee=emp,
                job_card_date__year=year_int,
                job_card_date__month=month_int,
            ).count()

            # Revenue = sum of all service prices on those job cards
            revenue = JobCardService.objects.filter(
                job_card__employee=emp,
                job_card__job_card_date__year=year_int,
                job_card__job_card_date__month=month_int,
            ).aggregate(total=Sum('price_at_time'))['total'] or Decimal('0')

            threshold_met = service_count >= order_threshold
            orders_above  = max(0, service_count - order_threshold)

            if not threshold_met:
                incentive = Decimal('0.00')
            elif incentive_type == 'fixed':
                incentive = (Decimal(str(orders_above)) * incentive_fixed_amt).quantize(Decimal('0.01'))
            else:
                incentive = (Decimal(str(emp.salary)) * incentive_salary_pct / Decimal('100')).quantize(Decimal('0.01'))

            order_pct   = round(service_count / order_threshold * 100, 1) if order_threshold > 0 else 0
            revenue_pct = round(float(revenue) / float(revenue_target) * 100, 1) if revenue_target > 0 else 0

            emp_data.append({
                'employee_id':            emp.id,
                'employee_name':          emp.employee_name,
                'employee_code':          emp.employee_code,
                'role':                   emp.role or '',
                'base_salary':            str(emp.salary),
                'service_count':          service_count,
                'revenue':                str(revenue.quantize(Decimal('0.01'))),
                'threshold_met':          threshold_met,
                'orders_above_threshold': orders_above,
                'incentive_earned':       str(incentive),
                'order_pct':              min(order_pct, 999),
                'revenue_pct':            min(revenue_pct, 999),
            })

        return Response({
            'employees': emp_data,
            'targets': {
                'order_threshold':          order_threshold,
                'revenue_target':           str(revenue_target),
                'incentive_type':           incentive_type,
                'incentive_fixed_amount':   str(incentive_fixed_amt),
                'incentive_salary_percent': str(incentive_salary_pct),
            },
            'month': month_int,
            'year':  year_int,
        })