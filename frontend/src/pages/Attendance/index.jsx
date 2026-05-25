import { useEffect, useState } from 'react';
import { Plus, CalendarCheck, Pencil, Trash2, ChevronLeft, ChevronRight, UserCheck, UserX, Clock, CalendarDays, LayoutList, LayoutGrid, AlertCircle } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import Table from '../../components/Table';
import Badge from '../../components/Badge';
import StatCard from '../../components/StatCard';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { Field, Input, Select } from '../../components/Field';
import { useToast } from '../../components/Toast';
import {
  listAttendance, createAttendance, updateAttendance, deleteAttendance,
  listEmployees,
} from '../../api/employees';
import { extractError } from '../../api/axios';

const STATUS_LABEL = {
  present:       { label: 'Present',   variant: 'green'  },
  absent:        { label: 'Absent',    variant: 'red'    },
  half_day:      { label: 'Half Day',  variant: 'blue'   },
  leave:         { label: 'Leave',     variant: 'purple' },
  late:          { label: 'Late',      variant: 'yellow' },
  overtime:      { label: 'Overtime',  variant: 'green'  },
  late_overtime: { label: 'Late+OT',  variant: 'yellow' },
  auto_absent:   { label: 'Absent',   variant: 'red'    },
};

const STATUS_ROW_CLASS = {
  present:       'hover:bg-emerald-900/10',
  absent:        'hover:bg-red-900/10',
  half_day:      'hover:bg-blue-900/10',
  leave:         'hover:bg-purple-900/10',
  late:          'hover:bg-yellow-900/10',
  overtime:      'hover:bg-emerald-900/10',
  late_overtime: 'hover:bg-yellow-900/10',
  auto_absent:   'hover:bg-red-900/10',
};

const STATUS_CELL_BG = {
  present:       'bg-emerald-900/20',
  absent:        'bg-red-900/20',
  half_day:      'bg-blue-900/20',
  leave:         'bg-purple-900/20',
  late:          'bg-yellow-900/20',
  overtime:      'bg-teal-900/20',
  late_overtime: 'bg-orange-900/20',
  auto_absent:   'bg-red-900/20',
};

const STATUS_TEXT = {
  present:       'text-emerald-400',
  absent:        'text-red-400',
  half_day:      'text-blue-400',
  leave:         'text-purple-400',
  late:          'text-yellow-400',
  overtime:      'text-teal-400',
  late_overtime: 'text-orange-400',
  auto_absent:   'text-red-400',
};

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmtMins(mins) {
  if (!mins || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function fmtTime(t) {
  if (!t) return null;
  const parts = t.split(':');
  const hh = parseInt(parts[0], 10);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 || 12;
  return `${h12}:${parts[1]} ${ampm}`;
}

export default function Attendance() {
  const toast = useToast();
  const now   = new Date();
  const [month, setMonth]           = useState(now.getMonth() + 1);
  const [year, setYear]             = useState(now.getFullYear());
  const [view, setView]             = useState('table');
  const [loading, setLoading]       = useState(true);
  const [records, setRecords]       = useState([]);
  const [employees, setEmployees]   = useState([]);
  const [filterEmp, setFilterEmp]   = useState('');
  const [modal, setModal]           = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [delLoading, setDelLoading] = useState(false);

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
  const today = todayStr();

  const load = async () => {
    setLoading(true);
    try {
      const params = { month, year };
      if (filterEmp) params.employee = filterEmp;
      const [att, emps] = await Promise.all([
        listAttendance(params),
        listEmployees(),
      ]);
      setRecords(Array.isArray(att) ? att : (att.results || []));
      setEmployees(Array.isArray(emps) ? emps : (emps.results || []));
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [month, year, filterEmp]); // eslint-disable-line

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); };
  const goToToday = () => { setMonth(now.getMonth() + 1); setYear(now.getFullYear()); };

  const onDelete = async () => {
    setDelLoading(true);
    try {
      await deleteAttendance(confirmDel.id);
      toast.success('Record deleted');
      setConfirmDel(null);
      load();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setDelLoading(false);
    }
  };

  const counts       = records.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  const presentCount = counts.present  || 0;
  const absentCount  = counts.absent   || 0;
  const lateCount    = counts.late     || 0;
  const leaveCount   = (counts.leave || 0) + (counts.half_day || 0);

  const columns = [
    {
      key: 'employee_name', header: 'Employee',
      render: (r) => <span className="font-medium text-gray-100">{r.employee_name}</span>,
    },
    {
      key: 'date', header: 'Date',
      render: (r) => <span className="text-gray-300 text-sm">{formatDate(r.date)}</span>,
    },
    {
      key: 'status', header: 'Status',
      render: (r) => {
        const s = STATUS_LABEL[r.status] || { label: r.status, variant: 'default' };
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      key: 'worked', header: 'Worked',
      render: (r) => r.worked_minutes > 0
        ? <span className="text-gray-300 text-sm font-mono">{fmtMins(r.worked_minutes)}</span>
        : <span className="text-gray-600">—</span>,
    },
    {
      key: 'notes', header: 'Notes',
      render: (r) => r.notes
        ? <span className="text-gray-400 text-xs">{r.notes}</span>
        : <span className="text-gray-600">—</span>,
    },
    {
      key: 'actions', header: '',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <button onClick={() => setModal({ mode: 'edit', data: r })} className="p-1.5 text-gray-400 hover:text-accent transition-colors">
            <Pencil size={14} />
          </button>
          <button onClick={() => setConfirmDel(r)} className="p-1.5 text-gray-400 hover:text-red-400 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Attendance"
        subtitle="Track daily employee attendance"
        actions={<Button onClick={() => setModal({ mode: 'create' })}><Plus size={16} /> Mark Attendance</Button>}
      />

      {/* Month navigator + view toggle + employee filter */}
      <div className="bg-bg-card border border-border rounded-xl p-4 mb-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1.5 text-gray-400 hover:text-gray-100 transition-colors">
            <ChevronLeft size={18} />
          </button>
          <span className="text-gray-100 font-semibold w-36 text-center">{MONTHS[month - 1]} {year}</span>
          <button onClick={nextMonth} className="p-1.5 text-gray-400 hover:text-gray-100 transition-colors">
            <ChevronRight size={18} />
          </button>
          {!isCurrentMonth && (
            <button
              onClick={goToToday}
              className="ml-1 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 transition-colors"
            >
              <CalendarDays size={11} /> Today
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 sm:ml-auto">
          {/* Table / Calendar toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden flex-shrink-0">
            <button
              onClick={() => setView('table')}
              title="Table view"
              className={`p-2 transition-colors ${view === 'table' ? 'bg-accent/20 text-accent' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <LayoutList size={15} />
            </button>
            <button
              onClick={() => setView('calendar')}
              title="Calendar view"
              className={`p-2 transition-colors ${view === 'calendar' ? 'bg-accent/20 text-accent' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <LayoutGrid size={15} />
            </button>
          </div>

          <div className="sm:w-56 w-full">
            <Select value={filterEmp} onChange={(e) => setFilterEmp(e.target.value)}>
              <option value="">All employees</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.employee_name}</option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {/* Summary stat cards */}
      {!loading && records.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <StatCard icon={UserCheck}     label="Present"       value={presentCount} accent="green"  />
          <StatCard icon={UserX}         label="Absent"        value={absentCount}  accent="red"    />
          <StatCard icon={Clock}         label="Late"          value={lateCount}    accent="yellow" />
          <StatCard icon={CalendarCheck} label="Leave / Half"  value={leaveCount}   accent="blue"   />
        </div>
      )}

      {loading ? (
        <Loading />
      ) : view === 'calendar' ? (
        <CalendarView
          records={records}
          month={month}
          year={year}
          today={today}
          filterEmp={filterEmp}
          onEdit={(r) => setModal({ mode: 'edit', data: r })}
          onDelete={setConfirmDel}
          onAddForDate={(dateStr) => setModal({ mode: 'create', defaultDate: dateStr, defaultEmployee: filterEmp })}
        />
      ) : records.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No attendance records"
          message={`No records for ${MONTHS[month - 1]} ${year}${filterEmp ? ' — try All employees' : ''}.`}
          action={<Button onClick={() => setModal({ mode: 'create' })}><Plus size={16} /> Mark Attendance</Button>}
        />
      ) : (
        <Table
          columns={columns}
          rows={records}
          rowClassName={(r) => STATUS_ROW_CLASS[r.status] || ''}
        />
      )}

      <AttendanceFormModal modal={modal} onClose={() => setModal(null)} onSaved={load} employees={employees} records={records} />
      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={onDelete}
        loading={delLoading}
        title="Delete attendance record?"
        message="This action cannot be undone."
      />
    </div>
  );
}

function CalendarView({ records, month, year, today, filterEmp, onEdit, onDelete, onAddForDate }) {
  const recordByDate = {};
  records.forEach((r) => { recordByDate[r.date] = r; });

  const daysInMonth  = new Date(year, month, 0).getDate();
  const firstDow     = new Date(year, month - 1, 1).getDay();
  const leadingEmpty = firstDow === 0 ? 6 : firstDow - 1;

  const cells = [
    ...Array(leadingEmpty).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const totalWorked = records.reduce((s, r) => s + (r.worked_minutes   || 0), 0);
  const totalLate   = records.reduce((s, r) => s + (r.late_minutes     || 0), 0);
  const totalOT     = records.reduce((s, r) => s + (r.overtime_minutes || 0), 0);

  if (!filterEmp) {
    return (
      <div className="bg-bg-card border border-border rounded-xl p-10 text-center">
        <LayoutGrid size={32} className="text-gray-600 mx-auto mb-3" />
        <p className="text-gray-300 text-sm font-medium mb-1">Select an employee to view calendar</p>
        <p className="text-gray-600 text-xs">Use the employee filter above to see a single person's monthly attendance.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {records.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-card border border-border rounded-lg text-xs">
            <Clock size={11} className="text-emerald-400" />
            <span className="text-gray-500">Worked:</span>
            <span className="text-emerald-300 font-semibold ml-0.5">{fmtMins(totalWorked) || '—'}</span>
          </span>
          {totalLate > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-card border border-border rounded-lg text-xs">
              <AlertCircle size={11} className="text-yellow-400" />
              <span className="text-gray-500">Late total:</span>
              <span className="text-yellow-300 font-semibold ml-0.5">{fmtMins(totalLate)}</span>
            </span>
          )}
          {totalOT > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-card border border-border rounded-lg text-xs">
              <Clock size={11} className="text-purple-400" />
              <span className="text-gray-500">Overtime:</span>
              <span className="text-purple-300 font-semibold ml-0.5">{fmtMins(totalOT)}</span>
            </span>
          )}
        </div>
      )}

      <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 border-l border-t border-border/30">
          {cells.map((day, idx) => {
            if (!day) {
              return (
                <div
                  key={`e-${idx}`}
                  className="border-r border-b border-border/30 bg-bg-elev/20 min-h-[88px]"
                />
              );
            }

            const dateStr  = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const rec      = recordByDate[dateStr];
            const isToday  = dateStr === today;
            const isFuture = dateStr > today;
            const cellBg   = rec ? (STATUS_CELL_BG[rec.status] || '') : '';

            return (
              <div
                key={dateStr}
                className={`border-r border-b border-border/30 min-h-[88px] p-1.5 flex flex-col relative group transition-colors ${cellBg} ${isFuture ? 'opacity-40' : ''}`}
              >
                <div className={`text-xs font-bold mb-1 w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 ${
                  isToday ? 'bg-accent text-white' : 'text-gray-500'
                }`}>
                  {day}
                </div>

                {rec ? (
                  <>
                    <span className={`text-[10px] font-semibold leading-tight ${STATUS_TEXT[rec.status] || 'text-gray-300'}`}>
                      {STATUS_LABEL[rec.status]?.label || rec.status}
                    </span>

                    {rec.check_in && (
                      <span className="text-[10px] text-gray-500 leading-tight mt-0.5">
                        {fmtTime(rec.check_in)}{rec.check_out ? ` – ${fmtTime(rec.check_out)}` : ''}
                      </span>
                    )}

                    {rec.worked_minutes > 0 && (
                      <span className="text-[10px] text-gray-600 leading-tight">{fmtMins(rec.worked_minutes)}</span>
                    )}

                    <div className="flex flex-wrap gap-x-1 mt-auto pt-0.5">
                      {rec.late_minutes > 0 && (
                        <span className="text-[9px] text-yellow-500 leading-none">+{fmtMins(rec.late_minutes)} late</span>
                      )}
                      {rec.overtime_minutes > 0 && (
                        <span className="text-[9px] text-purple-400 leading-none">+{fmtMins(rec.overtime_minutes)} OT</span>
                      )}
                    </div>

                    <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onEdit(rec)}
                        className="p-0.5 rounded text-gray-500 hover:text-accent bg-bg-card/80"
                      >
                        <Pencil size={10} />
                      </button>
                      <button
                        onClick={() => onDelete(rec)}
                        className="p-0.5 rounded text-gray-500 hover:text-red-400 bg-bg-card/80"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </>
                ) : (
                  !isFuture && (
                    <button
                      onClick={() => onAddForDate(dateStr)}
                      className="flex-1 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-accent"
                    >
                      <Plus size={13} />
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AttendanceFormModal({ modal, onClose, onSaved, employees, records }) {
  const toast  = useToast();
  const today  = todayStr();
  const empty  = { employee: '', date: today, status: 'present', notes: '' };

  const [form, setForm]         = useState(empty);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors]     = useState({});

  useEffect(() => {
    if (!modal) return;
    if (modal.mode === 'edit') {
      setForm({
        employee: modal.data.employee || '',
        date:     modal.data.date     || today,
        status:   modal.data.status   || 'present',
        notes:    modal.data.notes    || '',
      });
    } else {
      setForm({
        ...empty,
        date:     modal.defaultDate     || today,
        employee: modal.defaultEmployee || '',
      });
    }
    setErrors({});
  }, [modal]); // eslint-disable-line

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const eMap = {};
    if (!form.employee) eMap.employee = 'Select an employee';
    if (!form.date)     eMap.date     = 'Required';
    if (modal?.mode === 'create' && form.employee && form.date) {
      const dup = records.find((r) => String(r.employee) === String(form.employee) && r.date === form.date);
      if (dup) eMap.employee = `Already marked as ${STATUS_LABEL[dup.status]?.label || dup.status} on this date`;
    }
    setErrors(eMap);
    if (Object.keys(eMap).length) return;
    setSubmitting(true);
    try {
      const payload = {
        employee:  form.employee,
        date:      form.date,
        status:    form.status,
        notes:     form.notes || null,
        check_in:  null,
        check_out: null,
      };
      if (modal.mode === 'edit') {
        await updateAttendance(modal.data.id, payload);
        toast.success('Attendance updated');
      } else {
        await createAttendance(payload);
        toast.success('Attendance marked');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const statusMeta = {
    present:  { hint: 'Employee was present for the full day', color: 'text-emerald-400' },
    absent:   { hint: 'Employee did not come in',              color: 'text-red-400'     },
    half_day: { hint: 'Employee worked half the day',          color: 'text-blue-400'    },
    leave:    { hint: 'Employee is on approved leave',         color: 'text-purple-400'  },
    late:     { hint: 'Employee came in late',                 color: 'text-yellow-400'  },
  };

  return (
    <Modal
      open={!!modal}
      onClose={onClose}
      size="sm"
      title={modal?.mode === 'edit' ? 'Edit Attendance' : 'Mark Attendance'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={submitting}>
            {modal?.mode === 'edit' ? 'Save Changes' : 'Mark'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Employee" required error={errors.employee}>
          <Select value={form.employee} onChange={set('employee')}>
            <option value="">Select an employee…</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.employee_name}</option>
            ))}
          </Select>
        </Field>

        <Field label="Date" required error={errors.date} hint="Defaults to today — change to correct if marking for a past day">
          <Input
            type="date"
            value={form.date}
            max={today}
            onChange={set('date')}
          />
        </Field>

        <Field label="Status">
          <Select value={form.status} onChange={set('status')}>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="half_day">Half Day</option>
            <option value="leave">Leave</option>
            <option value="late">Late</option>
          </Select>
          {form.status && statusMeta[form.status] && (
            <span className={`block text-xs mt-1 ${statusMeta[form.status].color}`}>
              {statusMeta[form.status].hint}
            </span>
          )}
        </Field>

        <Field label="Notes (optional)">
          <Input placeholder="Any remarks about this attendance…" value={form.notes} onChange={set('notes')} />
        </Field>
      </form>
    </Modal>
  );
}
