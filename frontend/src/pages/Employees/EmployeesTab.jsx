import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, UserCog, Search, Pencil, Trash2,
  Phone, Mail, MapPin, Clock, Users, Briefcase,
  AlertTriangle, Star, Cake, ChevronsUpDown, CalendarPlus, IndianRupee, CalendarDays,
} from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import Badge from '../../components/Badge';
import { Field, Input, Select } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { listEmployees, createEmployee, updateEmployee, deleteEmployee, listShifts } from '../../api/employees';
import { extractError } from '../../api/axios';

const TYPE_LABEL = {
  full_time:  { label: 'Full-time',  variant: 'green'  },
  part_time:  { label: 'Part-time',  variant: 'blue'   },
  contractor: { label: 'Contractor', variant: 'purple' },
};

const STATUS_LABEL = {
  active:   { label: 'Active',   variant: 'green'  },
  inactive: { label: 'Inactive', variant: 'red'    },
  on_leave: { label: 'On Leave', variant: 'yellow' },
};

const TYPE_LEFT_BORDER = {
  full_time:  'border-l-emerald-500/70',
  part_time:  'border-l-blue-500/70',
  contractor: 'border-l-purple-500/70',
};

const AVATAR_COLORS = [
  'bg-accent/20 text-accent',
  'bg-emerald-900/50 text-emerald-300',
  'bg-blue-900/50 text-blue-300',
  'bg-purple-900/50 text-purple-300',
  'bg-yellow-900/50 text-yellow-300',
  'bg-red-900/50 text-red-300',
];

const SORT_OPTIONS = [
  { value: 'name_asc',    label: 'Name A→Z' },
  { value: 'name_desc',   label: 'Name Z→A' },
  { value: 'newest',      label: 'Newest First' },
  { value: 'oldest',      label: 'Oldest First' },
  { value: 'salary_desc', label: 'Salary ↓' },
  { value: 'salary_asc',  label: 'Salary ↑' },
];

// Fix #4 — defined outside component so the useEffect inside modal never closes over a stale value
const EMPTY_FORM = {
  employee_name: '', employee_phone_number: '', employee_email: '',
  employee_address: '', employee_type: 'full_time', status: 'active',
  dob: '', joining_date: '', salary: '', shift: '', role: '',
};

function getInitials(name) {
  return (name || '?').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

const fmtDate = (d) => {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtSalary = (n) => {
  const v = Number(n || 0);
  if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(1)}L`;
  if (v >= 1_000)    return `₹${(v / 1_000).toFixed(1)}K`;
  return `₹${v.toLocaleString('en-IN')}`;
};

// Fix #1 — append T00:00:00 so date strings parse as local time, not UTC midnight
function getTenure(joiningDate) {
  if (!joiningDate) return null;
  const now    = new Date();
  const joined = new Date(joiningDate + 'T00:00:00');
  const diffMs = now - joined;
  if (diffMs < 0) return null;
  const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (totalDays < 30) return { text: 'New hire', isNew: true };
  const months = Math.floor(totalDays / 30.44);
  if (months < 12) return { text: `${months}m`, isNew: false };
  const years     = Math.floor(months / 12);
  const remMonths = months % 12;
  return { text: remMonths > 0 ? `${years}y ${remMonths}m` : `${years}y`, isNew: false };
}

function isBirthdayThisMonth(dob) {
  if (!dob) return false;
  return new Date(dob + 'T00:00:00').getMonth() === new Date().getMonth();
}

function isAnniversaryThisMonth(joiningDate) {
  if (!joiningDate) return false;
  const joined = new Date(joiningDate + 'T00:00:00');
  const now    = new Date();
  return joined.getMonth() === now.getMonth() && joined.getFullYear() < now.getFullYear();
}

function sortEmployees(list, sort) {
  const arr = [...list];
  switch (sort) {
    case 'name_asc':    return arr.sort((a, b) => a.employee_name.localeCompare(b.employee_name));
    case 'name_desc':   return arr.sort((a, b) => b.employee_name.localeCompare(a.employee_name));
    case 'newest':      return arr.sort((a, b) => (b.joining_date || '').localeCompare(a.joining_date || ''));
    case 'oldest':      return arr.sort((a, b) => (a.joining_date || '').localeCompare(b.joining_date || ''));
    case 'salary_desc': return arr.sort((a, b) => Number(b.salary || 0) - Number(a.salary || 0));
    case 'salary_asc':  return arr.sort((a, b) => Number(a.salary || 0) - Number(b.salary || 0));
    default:            return arr;
  }
}

// ── Dashboard Strip ───────────────────────────────────────────────────────────

function DashboardStrip({ employees }) {
  const total        = employees.length;
  const fullTime     = employees.filter((e) => e.employee_type === 'full_time').length;
  const partTime     = employees.filter((e) => e.employee_type === 'part_time').length;
  const contractors  = employees.filter((e) => e.employee_type === 'contractor').length;
  const withSalary   = employees.filter((e) => Number(e.salary) > 0);
  const totalPayroll = withSalary.reduce((s, e) => s + Number(e.salary), 0);
  const avgSalary    = withSalary.length > 0 ? Math.round(totalPayroll / withSalary.length) : 0;
  const noSalary     = total - withSalary.length;
  const noShift      = employees.filter((e) => !e.shift).length;
  const newHires     = employees.filter((e) => getTenure(e.joining_date)?.isNew).length;

  const cards = [
    {
      icon: Users,
      iconCls: 'text-blue-400 bg-blue-900/30',
      label: 'Total Employees',
      value: String(total),
      sub: newHires > 0 ? `${newHires} new hire${newHires > 1 ? 's' : ''} this month` : `${fullTime} full-time · ${partTime + contractors} other`,
      highlight: 'text-blue-400',
    },
    {
      icon: Briefcase,
      iconCls: 'text-emerald-400 bg-emerald-900/30',
      label: 'Full-time',
      value: String(fullTime),
      sub: `${partTime} part-time · ${contractors} contractor${contractors !== 1 ? 's' : ''}`,
      highlight: 'text-emerald-400',
    },
    {
      icon: AlertTriangle,
      iconCls: noShift > 0 ? 'text-amber-400 bg-amber-900/30' : 'text-gray-500 bg-bg-elev',
      label: 'No Shift Assigned',
      value: String(noShift),
      sub: noShift > 0 ? 'Need shift assignment' : 'All employees have shifts',
      highlight: noShift > 0 ? 'text-amber-400' : 'text-gray-500',
    },
    {
      icon: IndianRupee,
      iconCls: 'text-yellow-400 bg-yellow-900/30',
      label: 'Monthly Payroll',
      value: fmtSalary(totalPayroll),
      sub: noSalary > 0
        ? `avg ${fmtSalary(avgSalary)} · ${noSalary} without salary`
        : `avg ${fmtSalary(avgSalary)} / employee`,
      highlight: 'text-yellow-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map(({ icon: Icon, iconCls, label, value, sub, highlight }) => (
        <div key={label} className="bg-bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconCls}`}>
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-gray-500 mb-1">{label}</div>
            <div className={`text-xl font-bold leading-none mb-1 ${highlight}`}>{value}</div>
            <div className="text-xs text-gray-500 truncate">{sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Contextual Banners ────────────────────────────────────────────────────────

function NoShiftBanner({ employees, onFilter }) {
  const unassigned = employees.filter((e) => !e.shift);
  if (unassigned.length === 0) return null;
  return (
    <div className="bg-amber-900/15 border border-amber-700/30 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-start gap-2.5 min-w-0">
        <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-300 min-w-0">
          <span className="font-semibold">{unassigned.length} employee{unassigned.length > 1 ? 's' : ''}</span>
          {' '}without a shift: {unassigned.map((e) => e.employee_name).join(', ')}
        </p>
      </div>
      <button
        onClick={onFilter}
        className="shrink-0 text-xs font-medium text-amber-400 hover:text-amber-300 underline underline-offset-2"
      >
        Filter
      </button>
    </div>
  );
}

// Fix #9 — banner label was "New hires this month" but logic uses 30-day window, not calendar month
function NewJoinersBanner({ employees }) {
  const newHires = employees.filter((e) => getTenure(e.joining_date)?.isNew);
  if (newHires.length === 0) return null;
  return (
    <div className="bg-emerald-900/10 border border-emerald-700/20 rounded-xl px-4 py-3">
      <p className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-1.5">
        <CalendarPlus size={13} /> Recently joined · last 30 days
      </p>
      <div className="flex flex-wrap gap-2">
        {newHires.map((e) => (
          <span key={e.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-900/30 text-emerald-300 text-xs border border-emerald-700/30">
            {e.employee_name}
            {e.joining_date && (
              <span className="text-emerald-600">· {fmtDate(e.joining_date)}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Employee Card ─────────────────────────────────────────────────────────────

function EmployeeCard({ emp, onEdit, onDelete, onCalendar }) {
  const t          = TYPE_LABEL[emp.employee_type]  || { label: emp.employee_type,  variant: 'default' };
  const st         = STATUS_LABEL[emp.status]        || { label: emp.status,         variant: 'default' };
  const color      = AVATAR_COLORS[(emp.id || 0) % AVATAR_COLORS.length];
  const tenure     = getTenure(emp.joining_date);
  const bday       = isBirthdayThisMonth(emp.dob);
  const anniv      = isAnniversaryThisMonth(emp.joining_date);
  const borderCls  = TYPE_LEFT_BORDER[emp.employee_type] || 'border-l-gray-600/40';
  // Fix #11 — dim cards for inactive / on-leave employees
  const dimCls     = emp.status !== 'active' ? 'opacity-60' : '';

  return (
    <div className={`bg-bg-card border border-border border-l-4 ${borderCls} rounded-2xl overflow-hidden flex flex-col transition-all hover:shadow-lg hover:shadow-black/20 hover:border-accent/30 ${dimCls}`}>

      {/* Header */}
      <div className="p-4 flex items-start gap-3">
        <div className="relative shrink-0">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold ${color}`}>
            {getInitials(emp.employee_name)}
          </div>
          {tenure?.isNew && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-bg-card" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-100 text-base truncate">{emp.employee_name}</span>
            {tenure?.isNew && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-900/40 text-emerald-400 border border-emerald-700/40 shrink-0">NEW</span>
            )}
            {bday && (
              <span title="Birthday this month"><Cake size={13} className="text-pink-400 shrink-0" /></span>
            )}
            {anniv && !tenure?.isNew && (
              <span title="Work anniversary this month"><Star size={13} className="text-yellow-400 shrink-0" /></span>
            )}
          </div>
          {emp.role && (
            <div className="text-xs text-gray-400 mt-0.5 truncate">{emp.role}</div>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant={t.variant}>{t.label}</Badge>
            {emp.status !== 'active' && <Badge variant={st.variant}>{st.label}</Badge>}
            <span className="text-[10px] font-mono text-accent bg-accent/10 border border-accent/30 px-1.5 py-0.5 rounded">
              {emp.employee_code}
            </span>
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="px-4 pb-3 space-y-1.5 border-b border-border">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Phone size={11} className="shrink-0 text-gray-600" />
          <a href={`tel:${emp.employee_phone_number}`} className="truncate hover:text-accent transition-colors">
            {emp.employee_phone_number}
          </a>
        </div>
        {emp.employee_email && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Mail size={11} className="shrink-0 text-gray-600" />
            <a href={`mailto:${emp.employee_email}`} className="truncate hover:text-accent transition-colors">
              {emp.employee_email}
            </a>
          </div>
        )}
        {emp.employee_address && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <MapPin size={11} className="shrink-0 text-gray-600" />
            <span className="truncate">{emp.employee_address}</span>
          </div>
        )}
      </div>

      {/* Employment */}
      <div className="px-4 py-3 border-b border-border space-y-1.5">
        <div className={`flex items-center gap-2 text-xs ${emp.shift_name ? 'text-gray-400' : 'text-amber-400/90'}`}>
          <Clock size={11} className={`shrink-0 ${emp.shift_name ? 'text-gray-600' : 'text-amber-500/70'}`} />
          <span className={emp.shift_name ? 'text-gray-300' : 'italic'}>
            {emp.shift_name || 'No shift assigned'}
          </span>
          {!emp.shift_name && (
            <AlertTriangle size={11} className="text-amber-400 ml-auto shrink-0" />
          )}
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          {emp.joining_date
            ? <span>Joined {fmtDate(emp.joining_date)}</span>
            : <span />
          }
          {tenure && !tenure.isNew && (
            <span className="font-medium text-gray-400">{tenure.text}</span>
          )}
        </div>
      </div>

      {/* Financial */}
      <div className="px-4 py-3 border-b border-border">
        {emp.salary ? (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Monthly Salary</span>
            <span className="text-sm font-semibold text-emerald-400">
              ₹{Number(emp.salary).toLocaleString('en-IN')} / mo
            </span>
          </div>
        ) : (
          <span className="text-xs text-gray-600 italic">No salary set</span>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 flex items-center justify-end gap-1 mt-auto">
        <button
          onClick={onCalendar}
          className="p-1.5 text-gray-400 hover:text-blue-400 rounded-lg hover:bg-blue-900/20 transition-colors"
          title="View Attendance Calendar"
        >
          <CalendarDays size={14} />
        </button>
        <button
          onClick={onEdit}
          className="p-1.5 text-gray-400 hover:text-accent rounded-lg hover:bg-accent/10 transition-colors"
          title="Edit"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 text-gray-400 hover:text-red-400 rounded-lg hover:bg-red-900/20 transition-colors"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

export default function EmployeesTab() {
  const toast    = useToast();
  const navigate = useNavigate();
  const [loading, setLoading]           = useState(true);
  const [employees, setEmployees]       = useState([]);
  const [search, setSearch]             = useState('');
  const [filterType, setFilterType]     = useState('');
  const [filterStatus, setFilterStatus] = useState('');   // Fix #6
  const [sort, setSort]                 = useState('name_asc');
  const [modal, setModal]               = useState(null);
  const [confirmDel, setConfirmDel]     = useState(null);
  const [delLoading, setDelLoading]     = useState(false);

  // Fix #10 — load all employees; filtering/searching is done client-side
  const load = async () => {
    setLoading(true);
    try {
      const data = await listEmployees();
      setEmployees(Array.isArray(data) ? data : (data.results || []));
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, []);

  const onDelete = async () => {
    if (!confirmDel) return;
    setDelLoading(true);
    try {
      await deleteEmployee(confirmDel.id);
      toast.success('Employee deleted');
      setConfirmDel(null);
      load();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setDelLoading(false);
    }
  };

  const noShiftCount = employees.filter((e) => !e.shift).length;

  // Fix #10 — client-side search across name, code, and phone
  const filtered = useMemo(() => {
    let result = employees;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((e) =>
        e.employee_name.toLowerCase().includes(q) ||
        (e.employee_code || '').toLowerCase().includes(q) ||
        (e.employee_phone_number || '').includes(q)
      );
    }

    // Fix #6 — status filter
    if (filterStatus) {
      result = result.filter((e) => e.status === filterStatus);
    }

    if (filterType === 'no_shift') {
      result = result.filter((e) => !e.shift);
    } else if (filterType) {
      result = result.filter((e) => e.employee_type === filterType);
    }

    return sortEmployees(result, sort);
  }, [employees, search, filterType, filterStatus, sort]);

  const clearFilters = () => { setFilterType(''); setFilterStatus(''); setSearch(''); };
  const hasFilters   = !!(search || filterType || filterStatus);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Employees"
        subtitle="Manage your team members"
        actions={<Button onClick={() => setModal({ mode: 'create' })}><Plus size={16} /> Add Employee</Button>}
      />

      {/* Dashboard strip */}
      {!loading && employees.length > 0 && <DashboardStrip employees={employees} />}

      {/* Contextual banners */}
      {!loading && employees.length > 0 && (
        <>
          <NewJoinersBanner employees={employees} />
          <NoShiftBanner employees={employees} onFilter={() => setFilterType('no_shift')} />
        </>
      )}

      {/* Filter + sort toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Fix #10 — search hint updated to reflect multi-field search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input
            placeholder="Search by name, code, or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        {/* Type filters */}
        <div className="flex items-center gap-1 flex-wrap">
          {[
            { key: '',           label: 'All types' },
            { key: 'full_time',  label: 'Full-time' },
            { key: 'part_time',  label: 'Part-time' },
            { key: 'contractor', label: 'Contractor' },
            { key: 'no_shift',   label: 'No Shift', count: noShiftCount, warning: true },
          ].map(({ key, label, count, warning }) => (
            <button
              key={key}
              onClick={() => setFilterType(key)}
              className={`px-3 py-1 rounded text-xs font-medium border transition-colors flex items-center gap-1 ${
                filterType === key
                  ? warning
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                    : 'bg-accent/20 text-accent border-accent/50'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-border'
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`font-bold ${filterType === key ? '' : 'text-amber-400'}`}>{count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Fix #6 — status filters */}
        <div className="flex items-center gap-1 flex-wrap border-l border-border pl-3">
          {[
            { key: '',         label: 'All status' },
            { key: 'active',   label: 'Active' },
            { key: 'inactive', label: 'Inactive' },
            { key: 'on_leave', label: 'On Leave' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                filterStatus === key
                  ? 'bg-accent/20 text-accent border-accent/50'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-border'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <ChevronsUpDown size={12} className="text-gray-500 shrink-0" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="bg-bg-elev border border-border text-xs text-gray-400 rounded-lg px-2 py-1.5 focus:outline-none focus:border-accent cursor-pointer"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {!loading && (
          <span className="text-xs text-gray-500 ml-auto">
            {filtered.length === employees.length
              ? `${employees.length} employee${employees.length !== 1 ? 's' : ''}`
              : `${filtered.length} of ${employees.length}`}
          </span>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <Loading />
      ) : employees.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="No employees found"
          message="Add your first team member to get started."
          action={<Button onClick={() => setModal({ mode: 'create' })}><Plus size={16} /> Add Employee</Button>}
        />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-sm">
          No employees match your filters.{' '}
          <button onClick={clearFilters} className="text-accent hover:underline">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((emp) => (
            <EmployeeCard
              key={emp.id}
              emp={emp}
              onEdit={() => setModal({ mode: 'edit', data: emp })}
              onDelete={() => setConfirmDel(emp)}
              onCalendar={() => navigate('/employees/attendance', { state: { openEmployee: emp } })}
            />
          ))}
        </div>
      )}

      {/* Fix #2 — removed unused `employees` prop from EmployeeFormModal */}
      <EmployeeFormModal modal={modal} onClose={() => setModal(null)} onSaved={load} />
      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={onDelete}
        loading={delLoading}
        title={`Delete ${confirmDel?.employee_name}?`}
        message="This will permanently remove the employee and cannot be undone."
      />
    </div>
  );
}

// ── Section Label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 mt-1">{children}</p>
  );
}

// ── Employee Form Modal ───────────────────────────────────────────────────────

// Fix #2 — removed unused `employees` prop
function EmployeeFormModal({ modal, onClose, onSaved }) {
  const toast = useToast();
  // Fix #4 — use the stable EMPTY_FORM constant defined at module level
  const [form, setForm]             = useState(EMPTY_FORM);
  const [shifts, setShifts]         = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors]         = useState({});

  // Fix #8 — refresh shifts every time the modal opens
  useEffect(() => {
    if (!modal) return;
    listShifts()
      .then((data) => setShifts(Array.isArray(data) ? data : (data.results || [])))
      .catch(() => {});
  }, [modal]);

  useEffect(() => {
    if (!modal) return;
    if (modal.mode === 'edit') {
      setForm({
        employee_code:         modal.data.employee_code         || '',
        employee_name:         modal.data.employee_name         || '',
        employee_phone_number: modal.data.employee_phone_number || '',
        employee_email:        modal.data.employee_email        || '',
        employee_address:      modal.data.employee_address      || '',
        employee_type:         modal.data.employee_type         || 'full_time',
        status:                modal.data.status                || 'active',
        dob:                   modal.data.dob                   || '',
        joining_date:          modal.data.joining_date          || '',
        salary:                modal.data.salary                || '',
        shift:                 modal.data.shift                 || '',
        role:                  modal.data.role                  || '',
      });
    } else {
      setForm({ ...EMPTY_FORM });
    }
    setErrors({});
  }, [modal]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const eMap = {};
    if (modal.mode === 'edit' && !form.employee_code?.trim()) eMap.employee_code = 'Required';
    if (!form.employee_name.trim())         eMap.employee_name         = 'Required';
    // Fix #7 — phone validation: must be non-empty and at least 10 digits
    if (!form.employee_phone_number.trim()) {
      eMap.employee_phone_number = 'Required';
    } else if (form.employee_phone_number.replace(/\D/g, '').length < 10) {
      eMap.employee_phone_number = 'Must be at least 10 digits';
    }
    if (!form.employee_email.trim())   eMap.employee_email   = 'Required';
    if (!form.employee_address.trim()) eMap.employee_address = 'Required';
    if (!form.joining_date)            eMap.joining_date     = 'Required';
    setErrors(eMap);
    if (Object.keys(eMap).length) return;
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        salary:       form.salary       === '' ? null : Number(form.salary),
        dob:          form.dob          || null,
        joining_date: form.joining_date || null,
        shift:        form.shift        || null,
        role:         form.role         || null,   // Fix #3 — send null not empty string
      };
      if (modal.mode === 'create') {
        delete payload.employee_code;  // backend auto-generates from PK
      }
      if (modal.mode === 'edit') {
        await updateEmployee(modal.data.id, payload);
        toast.success('Employee updated');
      } else {
        await createEmployee(payload);
        toast.success('Employee created');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={!!modal}
      onClose={onClose}
      size="lg"
      title={modal?.mode === 'edit' ? 'Edit Employee' : 'Add New Employee'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={submitting}>
            {modal?.mode === 'edit' ? 'Save Changes' : 'Create Employee'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <div>
          <SectionLabel>Identity</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {modal?.mode === 'edit' && (
              <Field label="Employee Code" required error={errors.employee_code}>
                <Input
                  placeholder="e.g. EMP001"
                  value={form.employee_code || ''}
                  onChange={set('employee_code')}
                  className="font-mono"
                />
              </Field>
            )}
            <Field
              label="Full Name"
              required
              error={errors.employee_name}
              className={modal?.mode === 'create' ? 'sm:col-span-2' : undefined}
            >
              <Input placeholder="e.g. Ravi Kumar" value={form.employee_name} onChange={set('employee_name')} />
            </Field>
          </div>
        </div>

        <div>
          <SectionLabel>Contact</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Phone" required error={errors.employee_phone_number}>
              <Input
                placeholder="e.g. 9876543210"
                value={form.employee_phone_number}
                onChange={set('employee_phone_number')}
                inputMode="numeric"
              />
            </Field>
            <Field label="Email" required error={errors.employee_email}>
              <Input type="email" placeholder="e.g. ravi@email.com" value={form.employee_email} onChange={set('employee_email')} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Address" required error={errors.employee_address}>
                <Input placeholder="Full address" value={form.employee_address} onChange={set('employee_address')} />
              </Field>
            </div>
          </div>
        </div>

        <div>
          <SectionLabel>Employment Details</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Role">
              <Input placeholder="e.g. Detailer, Manager, Receptionist" value={form.role} onChange={set('role')} />
            </Field>
            <Field label="Employee Type">
              <Select value={form.employee_type} onChange={set('employee_type')}>
                <option value="full_time">Full-time</option>
                <option value="part_time">Part-time</option>
                <option value="contractor">Contractor</option>
              </Select>
            </Field>
            {modal?.mode === 'edit' && (
              <Field label="Status">
                <Select value={form.status} onChange={set('status')}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="on_leave">On Leave</option>
                </Select>
              </Field>
            )}
            <Field label="Assigned Shift">
              <Select value={form.shift} onChange={set('shift')}>
                <option value="">No shift assigned</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>{s.shift_name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Joining Date" required error={errors.joining_date}>
              <Input type="date" value={form.joining_date} onChange={set('joining_date')} />
            </Field>
            <Field label="Date of Birth">
              <Input type="date" value={form.dob} onChange={set('dob')} />
            </Field>
            <Field label="Monthly Salary (₹)">
              <Input type="number" step="0.01" min="0" placeholder="e.g. 15000" value={form.salary} onChange={set('salary')} />
            </Field>
          </div>
        </div>
      </form>
    </Modal>
  );
}
