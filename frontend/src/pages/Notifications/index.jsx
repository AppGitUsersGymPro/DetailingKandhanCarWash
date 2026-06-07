import { useEffect, useState, useCallback } from 'react';
import { Bell, RefreshCw, CheckCircle2, Clock, XCircle, MessageSquare } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Loading from '../../components/Loading';
import Table from '../../components/Table';
import { useToast } from '../../components/Toast';
import { listNotifications } from '../../api/notifications';
import { extractError } from '../../api/axios';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { value: '',        label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'sent',    label: 'Sent' },
  { value: 'failed',  label: 'Failed' },
];

const TRIGGER_LABELS = {
  job_checkin:      'Check-in',
  job_completed:    'Completed',
  payment_received: 'Payment',
  customer_welcome: 'Welcome',
  garage_payment:   'Garage Pay',
  service_reminder: 'Service Due',
};

const STATUS_STYLE = {
  pending: { cls: 'bg-yellow-900/30 text-yellow-300 border-yellow-700', icon: Clock,        label: 'Pending' },
  sent:    { cls: 'bg-emerald-900/30 text-emerald-300 border-emerald-700', icon: CheckCircle2, label: 'Sent'    },
  failed:  { cls: 'bg-red-900/30 text-red-300 border-red-700',             icon: XCircle,      label: 'Failed'  },
};

const TRIGGER_STYLE = {
  job_checkin:      'bg-blue-900/30 text-blue-300 border-blue-700',
  job_completed:    'bg-emerald-900/30 text-emerald-300 border-emerald-700',
  payment_received: 'bg-indigo-900/30 text-indigo-300 border-indigo-700',
  customer_welcome: 'bg-violet-900/30 text-violet-300 border-violet-700',
  garage_payment:   'bg-amber-900/30 text-amber-300 border-amber-700',
  service_reminder: 'bg-teal-900/30 text-teal-300 border-teal-700',
};

// ── Stat box ──────────────────────────────────────────────────────────────────

function StatBox({ label, value, accent, icon: Icon }) {
  const border = {
    gray:   'border-gray-500/20 bg-gray-500/5',
    yellow: 'border-yellow-500/20 bg-yellow-500/5',
    green:  'border-emerald-500/20 bg-emerald-500/5',
    red:    'border-red-500/20 bg-red-500/5',
  }[accent];
  const text = {
    gray:   'text-gray-400',
    yellow: 'text-yellow-400',
    green:  'text-emerald-400',
    red:    'text-red-400',
  }[accent];
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-3 ${border}`}>
      <Icon size={20} className={text} />
      <div>
        <div className="text-xs text-gray-500">{label}</div>
        <div className={`text-xl font-bold ${text}`}>{value}</div>
      </div>
    </div>
  );
}

// ── Columns ───────────────────────────────────────────────────────────────────

const COLUMNS = [
  {
    key: 'trigger_type',
    header: 'Type',
    width: 120,
    render: (row) => (
      <span className={`inline-block text-xs px-2 py-0.5 rounded border font-medium ${TRIGGER_STYLE[row.trigger_type] || 'bg-gray-800 text-gray-300 border-gray-600'}`}>
        {TRIGGER_LABELS[row.trigger_type] || row.trigger_type}
      </span>
    ),
  },
  {
    key: 'recipient_name',
    header: 'Recipient',
    render: (row) => (
      <div>
        <div className="font-medium text-gray-100">{row.recipient_name}</div>
        <div className="text-xs text-gray-500 font-mono">{row.recipient_phone}</div>
      </div>
    ),
  },
  {
    key: 'message',
    header: 'Message',
    render: (row) => (
      <span className="text-gray-400 text-xs line-clamp-2 max-w-xs block" title={row.message}>
        {row.message}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    width: 110,
    render: (row) => {
      const s = STATUS_STYLE[row.status] || STATUS_STYLE.pending;
      const Icon = s.icon;
      return (
        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${s.cls}`}>
          <Icon size={11} />
          {s.label}
        </span>
      );
    },
  },
  {
    key: 'created_at',
    header: 'Created',
    width: 145,
    render: (row) => {
      const d = new Date(row.created_at);
      return (
        <div className="text-xs text-gray-400">
          <div>{d.toLocaleDateString('en-IN')}</div>
          <div className="text-gray-500">{d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      );
    },
  },
  {
    key: 'error_log',
    header: 'Error',
    render: (row) =>
      row.error_log
        ? <span className="text-xs text-red-400 font-mono">{row.error_log.slice(0, 60)}{row.error_log.length > 60 ? '…' : ''}</span>
        : <span className="text-gray-600 text-xs">—</span>,
  },
];

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const toast = useToast();
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows,       setRows]       = useState([]);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const data = await listNotifications(params);
      setRows(data);
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const total   = rows.length;
  const pending = rows.filter(r => r.status === 'pending').length;
  const sent    = rows.filter(r => r.status === 'sent').length;
  const failed  = rows.filter(r => r.status === 'failed').length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="WhatsApp notification log — verify records are entering the database correctly"
        actions={
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm text-gray-300
                       hover:bg-bg-hover transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      {loading ? <Loading /> : (
        <div className="space-y-5">

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatBox label="Total"   value={total}   accent="gray"   icon={MessageSquare} />
            <StatBox label="Pending" value={pending} accent="yellow" icon={Clock}         />
            <StatBox label="Sent"    value={sent}    accent="green"  icon={CheckCircle2}  />
            <StatBox label="Failed"  value={failed}  accent="red"    icon={XCircle}       />
          </div>

          {/* Filter bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">Filter by status:</span>
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                  statusFilter === f.value
                    ? 'bg-accent/20 text-accent border-accent/40'
                    : 'border-border text-gray-400 hover:text-gray-100 hover:border-gray-500'
                }`}
              >
                {f.label}
              </button>
            ))}
            <span className="ml-auto text-xs text-gray-500">{rows.length} records</span>
          </div>

          {/* Table */}
          <Table
            columns={COLUMNS}
            rows={rows}
            emptyMessage="No notifications found"
            rowClassName={(row) =>
              row.status === 'failed' ? 'bg-red-900/10' :
              row.status === 'pending' ? 'bg-yellow-900/5' : ''
            }
          />

        </div>
      )}
    </div>
  );
}
