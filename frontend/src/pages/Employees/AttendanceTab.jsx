import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, AlertCircle,
  CalendarDays, ArrowLeft, Pencil, Trash2, Clock, Users,
} from 'lucide-react';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { Field, Input, Select } from '../../components/Field';
import { useToast } from '../../components/Toast';
import {
  createAttendance, updateAttendance, deleteAttendance,
  listEmployees, listAttendance, getEmployeeCalendar,
} from '../../api/employees';
import { extractError } from '../../api/axios';

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_LABEL = {
  present:       'Present',
  absent:        'Absent',
  half_day:      'Half Day',
  leave:         'Leave',
  late:          'Late',
  overtime:      'Overtime',
  late_overtime: 'Late+OT',
  auto_absent:   'Absent',
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

const STATUS_BG = {
  present:       'bg-emerald-900/20',
  absent:        'bg-red-900/20',
  half_day:      'bg-blue-900/20',
  leave:         'bg-purple-900/20',
  late:          'bg-yellow-900/20',
  overtime:      'bg-teal-900/20',
  late_overtime: 'bg-orange-900/20',
  auto_absent:   'bg-red-900/20',
};

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const EMP_TYPE_LABEL = { full_time: 'Full-time', part_time: 'Part-time', contractor: 'Contractor' };

const EMP_STATUS_STYLE = {
  active:   'bg-emerald-900/30 text-emerald-400 border-emerald-700/40',
  inactive: 'bg-red-900/30 text-red-400 border-red-700/40',
  on_leave: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/40',
};

const AVATAR_COLORS = [
  'bg-accent/20 text-accent',
  'bg-emerald-900/50 text-emerald-300',
  'bg-blue-900/50 text-blue-300',
  'bg-purple-900/50 text-purple-300',
  'bg-yellow-900/50 text-yellow-300',
];

// Statuses that require check_in time
const REQUIRES_CHECK_IN = ['present', 'late', 'overtime', 'late_overtime', 'half_day'];

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtMins(mins) {
  if (!mins || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function fmtHours(mins) {
  if (!mins || mins <= 0) return '0h';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtTime(t) {
  if (!t) return null;
  const parts = t.split(':');
  const hh = parseInt(parts[0], 10);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 || 12;
  return `${h12}:${parts[1]} ${ampm}`;
}

function getInitials(name) {
  return (name || '?').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

function avatarColor(name) {
  return AVATAR_COLORS[(name || '').charCodeAt(0) % AVATAR_COLORS.length];
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AttendanceTab() {
  const toast    = useToast();
  const location = useLocation();
  const now      = new Date();

  const [view, setView]               = useState('employees'); // 'employees' | 'calendar'
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [month, setMonth]             = useState(now.getMonth() + 1);
  const [year, setYear]               = useState(now.getFullYear());

  const [employees, setEmployees]     = useState([]);
  const [empLoading, setEmpLoading]   = useState(true);
  const [todayAtt, setTodayAtt]       = useState([]);

  const [calData, setCalData]         = useState(null);
  const [calLoading, setCalLoading]   = useState(false);

  // Calendar mark modal state
  const [markModal, setMarkModal]       = useState(null);
  const [confirmDel, setConfirmDel]     = useState(null);
  const [delLoading, setDelLoading]     = useState(false);
  const [markingAll, setMarkingAll]     = useState(false);
  const [confirmMarkAll, setConfirmMarkAll] = useState(null);

  // Date-view state (for "By Date" mode within the employee list panel)
  const [listMode, setListMode]             = useState('staff'); // 'staff' | 'date'
  const [dateViewDate, setDateViewDate]     = useState(todayStr());
  const [dateViewAtt, setDateViewAtt]       = useState([]);
  const [dateViewLoading, setDateViewLoading] = useState(false);
  const [dvMarkModal, setDvMarkModal]       = useState(null);
  const [dvMarkEmpId, setDvMarkEmpId]       = useState(null);

  const today          = todayStr();
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  const handledState = useRef(false);

  const refreshTodayAtt = async () => {
    const att = await listAttendance({ date: today });
    setTodayAtt(Array.isArray(att) ? att : (att.results || []));
  };

  useEffect(() => {
    setEmpLoading(true);
    Promise.all([listEmployees(), listAttendance({ date: today })])
      .then(([emps, att]) => {
        setEmployees(Array.isArray(emps) ? emps : (emps.results || []));
        setTodayAtt(Array.isArray(att) ? att : (att.results || []));
      })
      .catch(() => {})
      .finally(() => setEmpLoading(false));
  }, []); // eslint-disable-line

  // Auto-open calendar if navigated from EmployeesTab with state
  useEffect(() => {
    if (!handledState.current && location.state?.openEmployee) {
      handledState.current = true;
      const emp = location.state.openEmployee;
      setSelectedEmp(emp);
      setMonth(now.getMonth() + 1);
      setYear(now.getFullYear());
      setCalData(null);
      setView('calendar');
    }
  }, []); // eslint-disable-line

  const loadCalendar = useCallback(async () => {
    if (!selectedEmp) return;
    setCalLoading(true);
    try {
      const data = await getEmployeeCalendar(selectedEmp.id, { year, month });
      setCalData(data);
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setCalLoading(false);
    }
  }, [selectedEmp, month, year]); // eslint-disable-line

  useEffect(() => {
    if (view === 'calendar') loadCalendar();
  }, [view, selectedEmp, month, year]); // eslint-disable-line

  const loadDateView = useCallback(async () => {
    setDateViewLoading(true);
    try {
      const att = await listAttendance({ date: dateViewDate });
      setDateViewAtt(Array.isArray(att) ? att : (att.results || []));
    } catch {} finally {
      setDateViewLoading(false);
    }
  }, [dateViewDate]);

  useEffect(() => {
    if (listMode === 'date') loadDateView();
  }, [listMode, dateViewDate]); // eslint-disable-line

  const openCalendar = (emp) => {
    setSelectedEmp(emp);
    setMonth(now.getMonth() + 1);
    setYear(now.getFullYear());
    setCalData(null);
    setView('calendar');
  };

  const backToList = () => {
    setView('employees');
    setSelectedEmp(null);
    setCalData(null);
  };

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1);
  };
  const goToThisMonth = () => { setMonth(now.getMonth() + 1); setYear(now.getFullYear()); };

  const todayAttMap   = {};
  todayAtt.forEach((r) => { todayAttMap[String(r.employee)] = r; });
  const unmarkedToday = employees.filter((e) => e.status === 'active' && !todayAttMap[String(e.id)]);

  const markAllPresent = async () => {
    const checkInTime = confirmMarkAll?.time;
    setConfirmMarkAll(null);
    setMarkingAll(true);
    try {
      const results = await Promise.allSettled(
        unmarkedToday.map((emp) =>
          createAttendance({ employee: emp.id, date: today, status: 'present', notes: null, check_in: checkInTime || null, check_out: null })
        )
      );
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed    = results.filter((r) => r.status === 'rejected').length;
      if (succeeded > 0) {
        toast.success(`Marked ${succeeded} employee${succeeded !== 1 ? 's' : ''} as present${failed > 0 ? ` (${failed} failed)` : ''}`);
      } else {
        toast.error('Failed to mark attendance — please try again');
      }
      await refreshTodayAtt();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setMarkingAll(false);
    }
  };

  const handleDelete = async () => {
    setDelLoading(true);
    try {
      await deleteAttendance(confirmDel.id);
      toast.success('Record deleted');
      setConfirmDel(null);
      await loadCalendar();
      if (confirmDel.date === today) await refreshTodayAtt();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setDelLoading(false);
    }
  };

  const openDateViewMark = (emp, rec) => {
    setDvMarkEmpId(emp.id);
    setDvMarkModal({
      dayInfo: {
        date:          dateViewDate,
        day:           new Date(dateViewDate + 'T00:00:00').getDate(),
        is_working_day: true,
        is_today:      dateViewDate === today,
        is_future:     false,
        record:        rec || null,
      },
    });
  };

  // ── Calendar view (full-screen take-over) ────────────────────────────────────

  if (view === 'calendar' && selectedEmp) {
    return (
      <>
        <EmployeeCalendar
          calData={calData}
          loading={calLoading}
          month={month}
          year={year}
          isCurrentMonth={isCurrentMonth}
          today={today}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
          onGoToThisMonth={goToThisMonth}
          onBack={backToList}
          onDayClick={(dayInfo) => setMarkModal({ dayInfo })}
          onDeleteRecord={(rec) => setConfirmDel(rec)}
        />
        <MarkDayModal
          modal={markModal}
          empId={selectedEmp.id}
          onClose={() => setMarkModal(null)}
          onSaved={async () => { setMarkModal(null); await loadCalendar(); await refreshTodayAtt(); }}
        />
        <ConfirmDialog
          open={!!confirmDel}
          onClose={() => setConfirmDel(null)}
          onConfirm={handleDelete}
          loading={delLoading}
          title="Delete attendance record?"
          message="This action cannot be undone."
        />
      </>
    );
  }

  // ── Employee list / date view ────────────────────────────────────────────────

  return (
    <>
      <div className="space-y-5">

        {/* Header + mode toggle */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-100">Attendance</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {listMode === 'staff'
                ? 'Select an employee to view or edit their monthly attendance calendar'
                : 'View and mark all staff attendance for a specific date'}
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => setListMode('staff')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                listMode === 'staff'
                  ? 'bg-accent/20 text-accent border-accent/40'
                  : 'border-border text-gray-400 hover:text-gray-200'
              }`}
            >
              <Users size={12} /> By Staff
            </button>
            <button
              onClick={() => setListMode('date')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                listMode === 'date'
                  ? 'bg-accent/20 text-accent border-accent/40'
                  : 'border-border text-gray-400 hover:text-gray-200'
              }`}
            >
              <CalendarDays size={12} /> By Date
            </button>
          </div>
        </div>

        {listMode === 'staff' ? (
          <EmployeeListPanel
            employees={employees}
            loading={empLoading}
            todayAttMap={todayAttMap}
            unmarkedToday={unmarkedToday}
            markingAll={markingAll}
            onViewCalendar={openCalendar}
            onRequestMarkAll={() => setConfirmMarkAll({ time: nowTimeStr() })}
          />
        ) : (
          <DateViewPanel
            employees={employees}
            loading={dateViewLoading}
            date={dateViewDate}
            onSetDate={setDateViewDate}
            attendance={dateViewAtt}
            today={today}
            onOpenMark={openDateViewMark}
          />
        )}

      </div>

      {/* Date-view mark modal */}
      <MarkDayModal
        modal={dvMarkModal}
        empId={dvMarkEmpId}
        onClose={() => { setDvMarkModal(null); setDvMarkEmpId(null); }}
        onSaved={async () => {
          setDvMarkModal(null);
          setDvMarkEmpId(null);
          await loadDateView();
          if (dateViewDate === today) await refreshTodayAtt();
        }}
      />

      <ConfirmDialog
        open={!!confirmMarkAll}
        onClose={() => setConfirmMarkAll(null)}
        onConfirm={markAllPresent}
        loading={markingAll}
        title={`Mark ${unmarkedToday.length} employee${unmarkedToday.length !== 1 ? 's' : ''} as present?`}
        message={`Check-in time ${confirmMarkAll?.time} will be recorded for all unmarked employees. This cannot be undone.`}
      />
    </>
  );
}

// ── Employee List Panel ────────────────────────────────────────────────────────

function EmployeeListPanel({ employees, loading, todayAttMap, unmarkedToday, markingAll, onViewCalendar, onRequestMarkAll }) {
  return (
    <div className="space-y-4">

      {/* Unmarked today banner */}
      {!loading && unmarkedToday.length > 0 && (
        <div className="bg-yellow-900/15 border border-yellow-700/30 rounded-xl px-4 py-3 flex items-start gap-2.5">
          <AlertCircle size={15} className="text-yellow-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-yellow-300 mb-1.5">
              {unmarkedToday.length} employee{unmarkedToday.length !== 1 ? 's' : ''} not marked for today
            </p>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {unmarkedToday.map((emp) => (
                <span key={emp.id} className="px-2 py-0.5 rounded-full bg-yellow-900/30 text-yellow-300 text-xs border border-yellow-700/30">
                  {emp.employee_name}
                </span>
              ))}
            </div>
            <button
              onClick={onRequestMarkAll}
              disabled={markingAll}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-900/30 text-emerald-400 border border-emerald-700/40 hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
            >
              {markingAll ? 'Marking…' : `Mark All Present (${unmarkedToday.length})`}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <Loading />
      ) : employees.length === 0 ? (
        <EmptyState icon={Users} title="No employees" message="Add employees first to track attendance." />
      ) : (
        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          <div className="divide-y divide-border/50">
            {employees.map((emp) => {
              const todayRec = todayAttMap[String(emp.id)];
              return (
                <div key={emp.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-bg-elev/40 transition-colors">
                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${avatarColor(emp.employee_name)}`}>
                    {getInitials(emp.employee_name)}
                  </div>

                  {/* Name + details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-100 text-sm">{emp.employee_name}</span>
                      <span className="text-[10px] font-mono text-accent bg-accent/10 border border-accent/30 px-1.5 py-0.5 rounded">
                        {emp.employee_code}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-gray-500">{EMP_TYPE_LABEL[emp.employee_type] || emp.employee_type}</span>
                      {emp.shift_name && (
                        <>
                          <span className="text-gray-600">·</span>
                          <span className="text-xs text-gray-500 flex items-center gap-0.5">
                            <Clock size={9} /> {emp.shift_name}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Today status */}
                  <div className="flex-shrink-0 text-right hidden sm:block">
                    {todayRec ? (
                      <span className={`text-xs font-semibold ${STATUS_TEXT[todayRec.status] || 'text-gray-400'}`}>
                        {STATUS_LABEL[todayRec.status] || todayRec.status}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-600">Not marked</span>
                    )}
                    <div className="text-[10px] text-gray-600 mt-0.5">Today</div>
                  </div>

                  {/* Emp status badge */}
                  <span className={`hidden md:inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border ${EMP_STATUS_STYLE[emp.status] || 'bg-bg-elev text-gray-400 border-border'}`}>
                    {emp.status === 'on_leave' ? 'On Leave' : emp.status === 'inactive' ? 'Inactive' : 'Active'}
                  </span>

                  {/* View Calendar button */}
                  <button
                    onClick={() => onViewCalendar(emp)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 transition-colors flex-shrink-0"
                  >
                    <CalendarDays size={12} />
                    Calendar
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Date View Panel ────────────────────────────────────────────────────────────

function DateViewPanel({ employees, loading, date, onSetDate, attendance, today, onOpenMark }) {
  const attMap = {};
  attendance.forEach((r) => { attMap[String(r.employee)] = r; });

  const dateLabel = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : '';

  const markedCount   = employees.filter((e) => attMap[String(e.id)]).length;
  const unmarkedCount = employees.filter((e) => !attMap[String(e.id)]).length;

  return (
    <div className="space-y-4">
      {/* Date picker row */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          type="date"
          value={date}
          max={today}
          onChange={(e) => onSetDate(e.target.value)}
          className="w-40"
        />
        {dateLabel && <span className="text-sm text-gray-400">{dateLabel}</span>}
        {!loading && employees.length > 0 && (
          <span className="ml-auto text-xs text-gray-500">
            <span className="text-emerald-400 font-medium">{markedCount}</span> marked ·{' '}
            <span className="text-yellow-400 font-medium">{unmarkedCount}</span> not marked
          </span>
        )}
      </div>

      {loading ? (
        <Loading />
      ) : employees.length === 0 ? (
        <EmptyState icon={Users} title="No employees" message="Add employees first to track attendance." />
      ) : (
        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          <div className="divide-y divide-border/50">
            {employees.map((emp) => {
              const rec = attMap[String(emp.id)];
              return (
                <div key={emp.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-bg-elev/40 transition-colors">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${avatarColor(emp.employee_name)}`}>
                    {getInitials(emp.employee_name)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-100 text-sm">{emp.employee_name}</span>
                      <span className="text-[10px] font-mono text-accent bg-accent/10 border border-accent/30 px-1.5 py-0.5 rounded">
                        {emp.employee_code}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">{EMP_TYPE_LABEL[emp.employee_type] || emp.employee_type}</span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {rec ? (
                      <div className="text-right">
                        <span className={`text-xs font-semibold ${STATUS_TEXT[rec.status] || 'text-gray-400'}`}>
                          {STATUS_LABEL[rec.status] || rec.status}
                        </span>
                        {rec.check_in && (
                          <div className="text-[10px] text-gray-500">{fmtTime(rec.check_in)}{rec.check_out ? ` – ${fmtTime(rec.check_out)}` : ''}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-600">Not marked</span>
                    )}
                    <button
                      onClick={() => onOpenMark(emp, rec || null)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border flex-shrink-0 ${
                        rec
                          ? 'bg-bg-elev text-gray-400 border-border hover:text-accent hover:border-accent/40'
                          : 'bg-accent/15 text-accent border-accent/30 hover:bg-accent/25'
                      }`}
                    >
                      {rec ? 'Edit' : 'Mark'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Employee Calendar (GymCRM-style) ──────────────────────────────────────────

function EmployeeCalendar({ calData, loading, month, year, isCurrentMonth, today, onPrevMonth, onNextMonth, onGoToThisMonth, onBack, onDayClick, onDeleteRecord }) {
  const emp    = calData?.employee;
  const shift  = calData?.shift;
  const counts = calData?.counts;

  // Build grid: days[0].weekday is Python weekday (0=Mon), which is exactly the number of leading empty cells
  let cells   = [];
  let padDays = 0;
  if (calData?.days?.length) {
    padDays = calData.days[0].weekday;
    cells   = [...Array(padDays).fill(null), ...calData.days];
    while (cells.length % 7 !== 0) cells.push(null);
  }

  return (
    <div className="space-y-5">

      {/* Header: back + employee info */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-100 hover:bg-bg-elev transition-colors flex-shrink-0"
        >
          <ArrowLeft size={15} /> Back
        </button>

        {emp && (
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${avatarColor(emp.employee_name)}`}>
              {getInitials(emp.employee_name)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-semibold text-gray-100">{emp.employee_name}</span>
                <span className="text-[10px] font-mono text-accent bg-accent/10 border border-accent/30 px-1.5 py-0.5 rounded">
                  {emp.employee_code}
                </span>
              </div>
              {shift && (
                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                  <Clock size={10} />
                  {shift.shift_name} · {fmtTime(shift.start_time)} – {fmtTime(shift.end_time)}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Month navigation */}
      <div className="bg-bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-2">
        <button onClick={onPrevMonth} className="p-1.5 text-gray-400 hover:text-gray-100 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <span className="text-gray-100 font-semibold w-36 text-center">{MONTHS[month - 1]} {year}</span>
        <button onClick={onNextMonth} className="p-1.5 text-gray-400 hover:text-gray-100 transition-colors">
          <ChevronRight size={18} />
        </button>
        {!isCurrentMonth && (
          <button
            onClick={onGoToThisMonth}
            className="ml-1 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 transition-colors"
          >
            <CalendarDays size={11} /> This Month
          </button>
        )}
      </div>

      {loading || !calData ? (
        <Loading />
      ) : (
        <>
          {/* Summary count boxes */}
          {counts && (
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              <CountBox label="Working Days" value={counts.working_days_in_month}                                      color="text-gray-300" />
              <CountBox label="Present"      value={(counts.present || 0) + (counts.overtime || 0)}                    color="text-emerald-400" />
              <CountBox label="Absent"       value={(counts.absent  || 0) + (counts.auto_absent || 0)}                 color="text-red-400" />
              <CountBox label="Late"         value={(counts.late    || 0) + (counts.late_overtime || 0)}               color="text-yellow-400" />
              <CountBox label="Overtime"     value={(counts.overtime || 0) + (counts.late_overtime || 0)}              color="text-teal-400" />
              <CountBox label="Half Day"     value={counts.half_day || 0}                                              color="text-blue-400" />
              <CountBox label="Leave"        value={counts.leave    || 0}                                              color="text-purple-400" />
              <CountBox label="Worked"       value={fmtHours(counts.total_worked_mins)}                                color="text-gray-100" small />
            </div>
          )}

          {/* Calendar grid */}
          <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
            {/* Day-name header */}
            <div className="grid grid-cols-7 border-b border-border">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <div key={d} className="py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 border-l border-t border-border/30">
              {cells.map((cell, idx) =>
                !cell ? (
                  <div key={`pad-${idx}`} className="border-r border-b border-border/30 bg-bg-elev/20 min-h-[90px]" />
                ) : (
                  <DayCell
                    key={cell.date}
                    dayInfo={cell}
                    today={today}
                    onDayClick={onDayClick}
                    onDeleteRecord={onDeleteRecord}
                  />
                )
              )}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-2 px-1">
            {[
              ['present', 'Present'], ['late', 'Late'], ['absent', 'Absent'],
              ['half_day', 'Half Day'], ['leave', 'Leave'], ['overtime', 'Overtime'], ['late_overtime', 'Late+OT'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5 text-xs text-gray-500">
                <div className={`w-2.5 h-2.5 rounded-sm ${(STATUS_BG[k] || 'bg-gray-700').replace('/20', '/60')}`} />
                <span className={STATUS_TEXT[k]}>{v}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className="w-2.5 h-2.5 rounded-sm bg-bg-elev/50 border border-border/40" />
              <span>Off day</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Count Box ──────────────────────────────────────────────────────────────────

function CountBox({ label, value, color, small = false }) {
  return (
    <div className="bg-bg-card border border-border rounded-xl p-2.5 text-center">
      <div className={`font-bold leading-tight ${small ? 'text-sm' : 'text-xl'} ${color}`}>{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">{label}</div>
    </div>
  );
}

// ── Day Cell ───────────────────────────────────────────────────────────────────

function DayCell({ dayInfo, today, onDayClick, onDeleteRecord }) {
  const { date, day, is_working_day, is_today, is_future, record } = dayInfo;
  const cellBg = record
    ? (STATUS_BG[record.status] || '')
    : !is_working_day ? 'bg-bg-elev/20' : '';

  // Only allow creating new records on working days; editing existing records is always allowed
  const canCreate = !is_future && !record && is_working_day;

  return (
    <div
      className={`border-r border-b border-border/30 min-h-[90px] p-1.5 flex flex-col relative group transition-colors
        ${cellBg}
        ${is_future ? 'opacity-40' : ''}
        ${canCreate ? 'cursor-pointer hover:bg-bg-elev/30' : ''}
      `}
      onClick={() => { if (canCreate) onDayClick(dayInfo); }}
    >
      {/* Day number */}
      <div className={`text-xs font-bold mb-1 w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0
        ${is_today ? 'bg-accent text-white' : 'text-gray-500'}`}>
        {day}
      </div>

      {/* Off-day label for unrecorded non-working days */}
      {!record && !is_working_day && !is_future && (
        <span className="text-[9px] text-gray-600 leading-none">Off</span>
      )}

      {record && (
        <>
          <span className={`text-[10px] font-semibold leading-tight ${STATUS_TEXT[record.status] || 'text-gray-300'}`}>
            {STATUS_LABEL[record.status] || record.status}
          </span>

          {(record.check_in || record.check_out) && (
            <span className="text-[10px] text-gray-500 leading-tight mt-0.5">
              {record.check_in ? fmtTime(record.check_in) : '—'}
              {record.check_out ? ` – ${fmtTime(record.check_out)}` : ''}
            </span>
          )}

          {record.worked_minutes > 0 && (
            <span className="text-[10px] text-gray-600 leading-tight">{fmtMins(record.worked_minutes)}</span>
          )}

          <div className="flex flex-wrap gap-x-1 mt-auto pt-0.5">
            {record.late_minutes > 0 && (
              <span className="text-[9px] text-yellow-500 leading-none">+{fmtMins(record.late_minutes)} late</span>
            )}
            {record.overtime_minutes > 0 && (
              <span className="text-[9px] text-teal-400 leading-none">+{fmtMins(record.overtime_minutes)} OT</span>
            )}
          </div>

          {/* Hover actions */}
          <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onDayClick(dayInfo); }}
              className="p-0.5 rounded text-gray-500 hover:text-accent bg-bg-card/90"
            >
              <Pencil size={10} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteRecord(record); }}
              className="p-0.5 rounded text-gray-500 hover:text-red-400 bg-bg-card/90"
            >
              <Trash2 size={10} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Mark / Edit Day Modal ──────────────────────────────────────────────────────

function MarkDayModal({ modal, empId, onClose, onSaved }) {
  const toast   = useToast();
  const dayInfo  = modal?.dayInfo;
  const existing = dayInfo?.record;
  const emptyForm = { status: 'present', check_in: '', check_out: '', notes: '' };

  const [form, setForm]             = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors]         = useState({});

  useEffect(() => {
    if (!modal) return;
    if (existing) {
      setForm({
        status:    existing.status  || 'present',
        check_in:  existing.check_in  ? existing.check_in.slice(0, 5)  : '',
        check_out: existing.check_out ? existing.check_out.slice(0, 5) : '',
        notes:     existing.notes  || '',
      });
    } else {
      setForm(emptyForm);
    }
    setErrors({});
  }, [modal]); // eslint-disable-line

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const eMap = {};
    if (REQUIRES_CHECK_IN.includes(form.status) && !form.check_in) {
      eMap.check_in = `Check-in time is required for "${form.status.replace('_', ' ')}" status`;
    }
    if (form.check_out && !form.check_in) {
      eMap.check_in = 'Check-in required when check-out is set';
    }
    setErrors(eMap);
    if (Object.keys(eMap).length) return;

    setSubmitting(true);
    try {
      const payload = {
        employee:  empId,
        date:      dayInfo.date,
        status:    form.status,
        check_in:  form.check_in  || null,
        check_out: form.check_out || null,
        notes:     form.notes     || null,
      };
      if (existing) {
        await updateAttendance(existing.id, payload);
        toast.success('Attendance updated');
      } else {
        await createAttendance(payload);
        toast.success('Attendance marked');
      }
      onSaved();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const dateLabel = dayInfo
    ? new Date(dayInfo.date + 'T00:00:00').toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : '';

  const needsCheckIn = REQUIRES_CHECK_IN.includes(form.status);

  return (
    <Modal
      open={!!modal}
      onClose={onClose}
      size="sm"
      title={existing ? 'Edit Attendance' : 'Mark Attendance'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={submitting}>
            {existing ? 'Save Changes' : 'Mark'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {/* Date display */}
        <div className="bg-bg-elev border border-border rounded-xl px-4 py-3">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Date</div>
          <div className="text-sm font-semibold text-gray-100">{dateLabel}</div>
        </div>

        <Field label="Status">
          <Select value={form.status} onChange={set('status')}>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="half_day">Half Day</option>
            <option value="leave">Leave</option>
            <option value="late">Late</option>
            <option value="overtime">Overtime</option>
            <option value="late_overtime">Late + Overtime</option>
          </Select>
          <span className="block text-[10px] text-gray-600 mt-1">
            Status is auto-determined from times when provided (except Absent, Half Day, Leave).
          </span>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Check-in${needsCheckIn ? ' *' : ''}`} error={errors.check_in}>
            <Input type="time" value={form.check_in} onChange={set('check_in')} />
          </Field>
          <Field label="Check-out">
            <Input type="time" value={form.check_out} onChange={set('check_out')} />
          </Field>
        </div>

        <Field label="Notes (optional)">
          <Input placeholder="Any remarks about this day…" value={form.notes} onChange={set('notes')} />
        </Field>
      </form>
    </Modal>
  );
}
