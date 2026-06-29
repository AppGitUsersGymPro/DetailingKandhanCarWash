import { useEffect, useState } from 'react';
import { Plus, Wallet, Pencil, Trash2, ChevronLeft, ChevronRight, CheckCircle, Clock, AlertCircle, AlertTriangle, Info } from 'lucide-react';
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
  listEmployees,
  listAdvances, createAdvance, updateAdvance, deleteAdvance,
  listTransactions, createTransaction, updateTransaction, deleteTransaction,
} from '../../api/employees';
import { extractError } from '../../api/axios';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const ADVANCE_STATUS = {
  pending: { label: 'Pending', variant: 'blue' },
  approved: { label: 'Approved', variant: 'green' },
  deducted: { label: 'Deducted', variant: 'purple' },
  rejected: { label: 'Rejected', variant: 'red' },
};

const PAY_STATUS = {
  pending: { label: 'Pending', variant: 'yellow' },
  paid: { label: 'Paid', variant: 'green' },
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function Salary() {
  const [tab, setTab] = useState('transactions');

  return (
    <div>
      <PageHeader title="Salary" subtitle="Manage payroll and advance payments" />

      <div className="flex gap-1 mb-6 border-b border-border">
        {[{ key: 'transactions', label: 'Salary Payments' }, { key: 'advances', label: 'Advances' }].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.key
              ? 'border-accent text-accent'
              : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'transactions' ? <TransactionsTab /> : <AdvancesTab />}
    </div>
  );
}

// ── Salary Payments Tab ───────────────────────────────────────────────────────

function TransactionsTab() {
  const toast = useToast();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [delLoading, setDelLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [txns, emps] = await Promise.all([
        listTransactions({ month, year }),
        listEmployees(),
      ]);
      setRecords(Array.isArray(txns) ? txns : (txns.results || []));
      setEmployees(Array.isArray(emps) ? emps : (emps.results || []));
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [month, year]); // eslint-disable-line

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); };

  const onDelete = async () => {
    setDelLoading(true);
    try {
      await deleteTransaction(confirmDel.id);
      toast.success('Payment deleted');
      setConfirmDel(null);
      load();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setDelLoading(false);
    }
  };

  const totalPayroll = records.reduce((s, r) => s + Number(r.net_paid), 0);
  const totalPaid = records.filter((r) => r.status === 'paid').reduce((s, r) => s + Number(r.net_paid), 0);
  const totalPending = records.filter((r) => r.status === 'pending').reduce((s, r) => s + Number(r.net_paid), 0);

  const columns = [
    {
      key: 'employee_name', header: 'Employee',
      render: (r) => <span className="font-medium text-gray-100">{r.employee_name}</span>,
    },
    {
      key: 'base_salary', header: 'Base Salary',
      render: (r) => <span className="text-gray-300">₹{Number(r.base_salary).toLocaleString('en-IN')}</span>,
    },
    {
      key: 'advance_deduction', header: 'Advance (−)',
      render: (r) => Number(r.advance_deduction) > 0
        ? <span className="text-red-400 font-medium">−₹{Number(r.advance_deduction).toLocaleString('en-IN')}</span>
        : <span className="text-gray-600">—</span>,
    },
    {
      key: 'bonus', header: 'Bonus (+)',
      render: (r) => Number(r.bonus) > 0
        ? <span className="text-emerald-400 font-medium">+₹{Number(r.bonus).toLocaleString('en-IN')}</span>
        : <span className="text-gray-600">—</span>,
    },
    {
      key: 'net_paid', header: 'Net Payable',
      render: (r) => {
        const net = Number(r.net_paid);
        return (
          <span className={`font-semibold ${net < 0 ? 'text-red-400' : 'text-gray-100'}`}>
            ₹{net.toLocaleString('en-IN')}
          </span>
        );
      },
    },
    {
      key: 'status', header: 'Status',
      render: (r) => {
        const s = PAY_STATUS[r.status] || { label: r.status, variant: 'default' };
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      key: 'payment_date', header: 'Paid On',
      render: (r) => r.payment_date
        ? <span className="text-gray-300 text-xs">{r.payment_date}</span>
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
      <div className="flex items-center justify-between mb-5">
        <div className="bg-bg-card border border-border rounded-xl px-4 py-2.5 flex items-center gap-3">
          <button onClick={prevMonth} className="p-1 text-gray-400 hover:text-gray-100 transition-colors"><ChevronLeft size={16} /></button>
          <span className="text-gray-100 font-semibold text-sm w-32 text-center">{MONTHS[month - 1]} {year}</span>
          <button onClick={nextMonth} className="p-1 text-gray-400 hover:text-gray-100 transition-colors"><ChevronRight size={16} /></button>
        </div>
        <Button onClick={() => setModal({ mode: 'create' })}><Plus size={16} /> Add Payment</Button>
      </div>

      {!loading && records.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <StatCard icon={Wallet} label="Total Payroll" value={`₹${totalPayroll.toLocaleString('en-IN')}`} accent="accent" />
          <StatCard icon={CheckCircle} label="Paid" value={`₹${totalPaid.toLocaleString('en-IN')}`} accent="green" />
          <StatCard icon={Clock} label="Pending" value={`₹${totalPending.toLocaleString('en-IN')}`} accent="yellow" />
        </div>
      )}

      {loading ? (
        <Loading />
      ) : records.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No salary payments"
          message={`No records for ${MONTHS[month - 1]} ${year}.`}
          action={<Button onClick={() => setModal({ mode: 'create' })}><Plus size={16} /> Add Payment</Button>}
        />
      ) : (
        <Table columns={columns} rows={records} rowClassName={(r) => r.status === 'paid' ? 'opacity-75' : ''} />
      )}

      <TransactionFormModal
        modal={modal}
        onClose={() => setModal(null)}
        onSaved={load}
        employees={employees}
        currentMonth={month}
        currentYear={year}
      />
      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={onDelete}
        loading={delLoading}
        title="Delete salary payment?"
        message="This action cannot be undone."
      />
    </div>
  );
}

// ── Transaction Form Modal ────────────────────────────────────────────────────

function TransactionFormModal({ modal, onClose, onSaved, employees, currentMonth, currentYear }) {
  const toast = useToast();

  const buildEmpty = () => ({
    employee: '',
    month: `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`,
    base_salary: '', bonus: '0', advance_deduction: '0',
    status: 'pending', payment_date: '', notes: '',
  });

  const [form, setForm] = useState(buildEmpty);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [approvedAdvances, setApprovedAdvances] = useState([]);
  const [loadingAdvances, setLoadingAdvances] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (!modal) return;
    if (modal.mode === 'edit') {
      setForm({
        employee: String(modal.data.employee || ''),
        month: modal.data.month || buildEmpty().month,
        base_salary: modal.data.base_salary || '',
        bonus: modal.data.bonus || '0',
        advance_deduction: modal.data.advance_deduction || '0',
        status: modal.data.status || 'pending',
        payment_date: modal.data.payment_date || '',
        notes: modal.data.notes || '',
      });
      setApprovedAdvances([]);
    } else {
      setForm(buildEmpty());
      setApprovedAdvances([]);
    }
    setErrors({});
  }, [modal]); // eslint-disable-line

  // When employee changes in CREATE mode — auto-fill salary + approved advances
  const handleEmployeeChange = (empId) => {
    if (modal?.mode === 'edit') {
      setForm((f) => ({ ...f, employee: empId }));
      return;
    }

    // 1. Auto-fill base_salary from employee profile
    const emp = employees.find((e) => String(e.id) === String(empId));
    const salary = emp?.salary ? String(emp.salary) : '';

    setForm((f) => ({ ...f, employee: empId, base_salary: salary, advance_deduction: '0' }));
    setApprovedAdvances([]);

    if (!empId) return;

    // 2. Fetch approved advances for this employee
    setLoadingAdvances(true);
    listAdvances({ employee: empId, status: 'approved' })
      .then((data) => {
        const advs = Array.isArray(data) ? data : (data.results || []);
        setApprovedAdvances(advs);
        const total = advs.reduce((s, a) => s + Number(a.amount), 0);
        setForm((f) => ({ ...f, advance_deduction: String(total) }));
      })
      .catch(() => { })
      .finally(() => setLoadingAdvances(false));
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const base = Number(form.base_salary) || 0;
  const adv = Number(form.advance_deduction) || 0;
  const bon = Number(form.bonus) || 0;
  const net = base + bon - adv;

  const selectedEmp = employees.find((e) => String(e.id) === String(form.employee));

  const submit = async (e) => {
    e.preventDefault();
    const eMap = {};
    if (!form.employee) eMap.employee = 'Select an employee';
    if (!form.base_salary) eMap.base_salary = 'Required';
    setErrors(eMap);
    if (Object.keys(eMap).length) return;
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        base_salary: Number(form.base_salary),
        bonus: Number(form.bonus) || 0,
        advance_deduction: Number(form.advance_deduction) || 0,
        payment_date: form.payment_date || null,
        notes: form.notes || null,
      };
      if (modal.mode === 'edit') {
        await updateTransaction(modal.data.id, payload);
        toast.success('Payment updated');
      } else {
        await createTransaction(payload);
        toast.success('Payment added');
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
      title={modal?.mode === 'edit' ? 'Edit Salary Payment' : 'Add Salary Payment'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={submitting}>
            {modal?.mode === 'edit' ? 'Save Changes' : 'Create Payment'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">

        {/* Employee */}
        <Field label="Employee" required error={errors.employee}>
          <Select
            value={form.employee}
            onChange={(e) => handleEmployeeChange(e.target.value)}
          >
            <option value="">Select an employee…</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.employee_name}
                {emp.salary ? ` — ₹${Number(emp.salary).toLocaleString('en-IN')}/mo` : ''}
              </option>
            ))}
          </Select>
        </Field>

        {/* Month */}
        <Field label="Month">
          <Input
            type="month"
            value={form.month?.slice(0, 7)}
            onChange={(e) => setForm((f) => ({ ...f, month: e.target.value + '-01' }))}
          />
        </Field>

        {/* Salary row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Base Salary (₹)"
            required
            error={errors.base_salary}
            hint={
              modal?.mode !== 'edit' && selectedEmp?.salary
                ? `Auto-filled from ${selectedEmp.employee_name}'s profile — edit if needed`
                : undefined
            }
          >
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 15000"
              value={form.base_salary}
              onChange={set('base_salary')}
            />
          </Field>

          <Field label="Bonus (₹)">
            <Input type="number" step="0.01" min="0" placeholder="0" value={form.bonus} onChange={set('bonus')} />
          </Field>
        </div>

        {/* Advance deduction */}
        <Field
          label="Advance Deduction (₹)"
          hint={
            loadingAdvances
              ? 'Fetching approved advances…'
              : approvedAdvances.length > 0
                ? `Auto-filled: ${approvedAdvances.length} approved advance${approvedAdvances.length > 1 ? 's' : ''} totalling ₹${approvedAdvances.reduce((s, a) => s + Number(a.amount), 0).toLocaleString('en-IN')} — edit to deduct partially`
                : modal?.mode !== 'edit' && form.employee
                  ? 'No approved advances found for this employee'
                  : undefined
          }
        >
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0"
            value={form.advance_deduction}
            onChange={set('advance_deduction')}
            disabled={loadingAdvances}
          />
        </Field>

        {/* Approved advances breakdown */}
        {approvedAdvances.length > 0 && (
          <div className="bg-yellow-900/10 border border-yellow-700/30 rounded-lg p-3 space-y-1.5">
            <p className="text-xs font-semibold text-yellow-400 flex items-center gap-1.5">
              <Info size={12} /> Approved advances — mark them as Deducted after salary is paid
            </p>
            {approvedAdvances.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-xs text-gray-400">
                <span>{a.date}</span>
                <span className="font-medium text-yellow-300">₹{Number(a.amount).toLocaleString('en-IN')}</span>
                {a.reason && <span className="text-gray-600 truncate max-w-[120px]">{a.reason}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Net payable preview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-gray-300 mb-1.5">Net Payable</p>
            <div className={`px-3 py-2.5 rounded-lg border text-sm font-semibold flex items-center justify-between ${net < 0
              ? 'border-red-700/40 bg-red-900/20 text-red-300'
              : net === 0
                ? 'border-yellow-700/40 bg-yellow-900/20 text-yellow-300'
                : 'border-emerald-700/40 bg-emerald-900/20 text-emerald-300'
              }`}>
              <span>₹{net.toLocaleString('en-IN')}</span>
              <span className="text-xs font-normal opacity-70">
                {base > 0 && `${base.toLocaleString('en-IN')}${bon > 0 ? ` + ${bon.toLocaleString('en-IN')}` : ''}${adv > 0 ? ` − ${adv.toLocaleString('en-IN')}` : ''}`}
              </span>
            </div>
          </div>

          <Field label="Payment Status">
            <Select value={form.status} onChange={set('status')}>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </Select>
          </Field>
        </div>

        {/* Negative net warning */}
        {net < 0 && (
          <div className="bg-red-900/20 border border-red-700/40 rounded-lg px-4 py-3 flex items-start gap-2.5">
            <AlertTriangle size={15} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-red-300 mb-0.5">Advance deduction exceeds salary</p>
              <p className="text-xs text-red-400/80">
                Deducting ₹{adv.toLocaleString('en-IN')} from a ₹{base.toLocaleString('en-IN')} salary results in a negative payout.
                Consider reducing the deduction and carrying the remaining ₹{Math.abs(net).toLocaleString('en-IN')} to next month.
              </p>
            </div>
          </div>
        )}

        {/* Payment date + notes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Payment Date" hint={form.status === 'paid' ? 'Required when marking as Paid' : undefined}>
            <Input type="date" value={form.payment_date} onChange={set('payment_date')} />
          </Field>
          <Field label="Notes (optional)">
            <Input placeholder="Any remarks…" value={form.notes} onChange={set('notes')} />
          </Field>
        </div>

      </form>
    </Modal>
  );
}

// ── Advances Tab ──────────────────────────────────────────────────────────────

function AdvancesTab() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [delLoading, setDelLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [advs, emps] = await Promise.all([
        listAdvances(filterStatus ? { status: filterStatus } : undefined),
        listEmployees(),
      ]);
      setRecords(Array.isArray(advs) ? advs : (advs.results || []));
      setEmployees(Array.isArray(emps) ? emps : (emps.results || []));
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterStatus]); // eslint-disable-line

  const onDelete = async () => {
    setDelLoading(true);
    try {
      await deleteAdvance(confirmDel.id);
      toast.success('Advance deleted');
      setConfirmDel(null);
      load();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setDelLoading(false);
    }
  };

  // Quick status update without opening the edit modal
  const quickUpdate = async (adv, newStatus) => {
    try {
      await updateAdvance(adv.id, {
        employee: adv.employee,
        date: adv.date,
        amount: Number(adv.amount),
        reason: adv.reason || null,
        status: newStatus,
      });
      const msgs = { approved: 'Advance approved', rejected: 'Advance rejected', deducted: 'Marked as deducted' };
      toast.success(msgs[newStatus] || 'Updated');
      load();
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  const pendingCount = records.filter((r) => r.status === 'pending').length;
  const approvedBalance = records.filter((r) => r.status === 'approved').reduce((s, r) => s + Number(r.amount), 0);
  const pendingBalance = records.filter((r) => r.status === 'pending').reduce((s, r) => s + Number(r.amount), 0);
  const totalDeducted = records.filter((r) => r.status === 'deducted').reduce((s, r) => s + Number(r.amount), 0);

  const columns = [
    {
      key: 'employee_name', header: 'Employee',
      render: (r) => <span className="font-medium text-gray-100">{r.employee_name}</span>,
    },
    { key: 'date', header: 'Date' },
    {
      key: 'amount', header: 'Amount',
      render: (r) => <span className="font-semibold text-yellow-300">₹{Number(r.amount).toLocaleString('en-IN')}</span>,
    },
    {
      key: 'reason', header: 'Reason',
      render: (r) => r.reason
        ? <span className="text-gray-400 text-xs">{r.reason}</span>
        : <span className="text-gray-600">—</span>,
    },
    {
      key: 'status', header: 'Status',
      render: (r) => {
        const s = ADVANCE_STATUS[r.status] || { label: r.status, variant: 'default' };
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      key: 'actions', header: '',
      render: (r) => (
        <div className="flex items-center justify-end gap-1 flex-wrap">
          {/* Quick actions per status */}
          {r.status === 'pending' && (
            <>
              <button
                onClick={() => quickUpdate(r, 'approved')}
                className="px-2 py-1 rounded text-xs bg-emerald-900/30 text-emerald-400 border border-emerald-700/40 hover:bg-emerald-900/50 transition-colors"
              >
                ✓ Approve
              </button>
              <button
                onClick={() => quickUpdate(r, 'rejected')}
                className="px-2 py-1 rounded text-xs bg-red-900/30 text-red-400 border border-red-700/40 hover:bg-red-900/50 transition-colors"
              >
                ✗ Reject
              </button>
            </>
          )}
          {r.status === 'approved' && (
            <button
              onClick={() => quickUpdate(r, 'deducted')}
              className="px-2 py-1 rounded text-xs bg-purple-900/30 text-purple-400 border border-purple-700/40 hover:bg-purple-900/50 transition-colors whitespace-nowrap"
            >
              Mark Deducted
            </button>
          )}
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
      {/* Filter + Add + pending alert */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap items-center">
          {['', 'pending', 'approved', 'deducted', 'rejected'].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border flex items-center gap-1.5 ${filterStatus === s
                ? 'bg-accent text-white border-accent'
                : 'bg-bg-elev text-gray-400 border-border hover:text-gray-100'
                }`}
            >
              {s === '' ? 'All' : ADVANCE_STATUS[s]?.label || s}
              {s === 'pending' && pendingCount > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${filterStatus === 'pending' ? 'bg-white/20' : 'bg-yellow-500/30 text-yellow-300'}`}>
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <Button onClick={() => setModal({ mode: 'create' })}><Plus size={16} /> Add Advance</Button>
      </div>

      {/* Pending attention banner */}
      {!loading && pendingCount > 0 && !filterStatus && (
        <div className="bg-yellow-900/15 border border-yellow-700/30 rounded-xl px-4 py-3 mb-4 flex items-center gap-2.5">
          <AlertCircle size={15} className="text-yellow-400 shrink-0" />
          <p className="text-xs text-yellow-300">
            <span className="font-semibold">{pendingCount} advance{pendingCount > 1 ? 's' : ''}</span> waiting for approval.
            Use <span className="font-semibold">✓ Approve</span> or <span className="font-semibold">✗ Reject</span> in the table below.
          </p>
        </div>
      )}

      {/* Summary cards */}
      {!loading && records.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <StatCard icon={Clock} label="Pending Approval" value={`₹${pendingBalance.toLocaleString('en-IN')}`} accent="blue" />
          <StatCard icon={AlertCircle} label="Approved (Due)" value={`₹${approvedBalance.toLocaleString('en-IN')}`} accent="yellow" />
          <StatCard icon={CheckCircle} label="Total Deducted" value={`₹${totalDeducted.toLocaleString('en-IN')}`} accent="green" />
        </div>
      )}

      {loading ? (
        <Loading />
      ) : records.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No advance records"
          message={filterStatus ? `No ${ADVANCE_STATUS[filterStatus]?.label.toLowerCase()} advances found.` : 'No salary advance records yet.'}
          action={!filterStatus && <Button onClick={() => setModal({ mode: 'create' })}><Plus size={16} /> Add Advance</Button>}
        />
      ) : (
        <Table columns={columns} rows={records} />
      )}

      <AdvanceFormModal modal={modal} onClose={() => setModal(null)} onSaved={load} employees={employees} />
      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={onDelete}
        loading={delLoading}
        title="Delete advance record?"
        message="This action cannot be undone."
      />
    </div>
  );
}

// ── Advance Form Modal ────────────────────────────────────────────────────────

function AdvanceFormModal({ modal, onClose, onSaved, employees }) {
  const toast = useToast();
  const today = todayStr();
  const empty = { employee: '', date: today, amount: '', reason: '', status: 'pending' };

  const [form, setForm] = useState(empty);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!modal) return;
    if (modal.mode === 'edit') {
      setForm({
        employee: String(modal.data.employee || ''),
        date: modal.data.date || today,
        amount: modal.data.amount || '',
        reason: modal.data.reason || '',
        status: modal.data.status || 'pending',
      });
    } else {
      setForm({ ...empty, date: today });
    }
    setErrors({});
  }, [modal]); // eslint-disable-line

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Show the employee's salary as context so manager knows how much is reasonable
  const selectedEmp = employees.find((e) => String(e.id) === String(form.employee));

  const submit = async (e) => {
    e.preventDefault();
    const eMap = {};
    if (!form.employee) eMap.employee = 'Select an employee';
    if (!form.date) eMap.date = 'Required';
    if (!form.amount) eMap.amount = 'Required';
    if (Number(form.amount) <= 0) eMap.amount = 'Amount must be greater than 0';
    setErrors(eMap);
    if (Object.keys(eMap).length) return;
    setSubmitting(true);
    try {
      const payload = { ...form, amount: Number(form.amount), reason: form.reason || null };
      if (modal.mode === 'edit') {
        await updateAdvance(modal.data.id, payload);
        toast.success('Advance updated');
      } else {
        await createAdvance(payload);
        toast.success('Advance request added');
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
      size="sm"
      title={modal?.mode === 'edit' ? 'Edit Advance' : 'Add Salary Advance'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={submitting}>
            {modal?.mode === 'edit' ? 'Save Changes' : 'Add Advance'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Employee" required error={errors.employee}>
          <Select value={form.employee} onChange={set('employee')}>
            <option value="">Select an employee…</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.employee_name}
                {emp.salary ? ` — ₹${Number(emp.salary).toLocaleString('en-IN')}/mo` : ''}
              </option>
            ))}
          </Select>
          {selectedEmp?.salary && (
            <span className="block text-xs text-gray-500 mt-1">
              Fixed salary: ₹{Number(selectedEmp.salary).toLocaleString('en-IN')}/month
            </span>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Date" required error={errors.date} hint="Defaults to today">
            <Input type="date" value={form.date} max={today} onChange={set('date')} />
          </Field>
          <Field label="Amount (₹)" required error={errors.amount}>
            <Input type="number" step="0.01" min="0.01" placeholder="e.g. 2000" value={form.amount} onChange={set('amount')} />
          </Field>
        </div>

        {/* Warn if advance amount is more than monthly salary */}
        {selectedEmp?.salary && Number(form.amount) > Number(selectedEmp.salary) && (
          <div className="bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2 flex items-center gap-2">
            <AlertTriangle size={13} className="text-red-400 shrink-0" />
            <span className="text-xs text-red-300">
              Advance amount exceeds monthly salary of ₹{Number(selectedEmp.salary).toLocaleString('en-IN')}.
            </span>
          </div>
        )}

        <Field label="Status">
          <Select value={form.status} onChange={set('status')}>
            <option value="pending">Pending — awaiting approval</option>
            <option value="approved">Approved — amount given to employee</option>
            <option value="deducted">Deducted — already deducted from salary</option>
            <option value="rejected">Rejected — request denied</option>
          </Select>
        </Field>

        <Field label="Reason (optional)">
          <Input placeholder="Why is this advance needed?" value={form.reason} onChange={set('reason')} />
        </Field>
      </form>
    </Modal>
  );
}
