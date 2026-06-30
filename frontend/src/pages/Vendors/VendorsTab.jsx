import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Truck, Pencil, Trash2, Search, FileText, Printer,
  AlertTriangle, TrendingUp, Users, Award, Phone, Mail, MapPin, Building2,
} from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { Field, Input } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { listVendors, createVendor, updateVendor, deleteVendor, getVendorStatement } from '../../api/vendors';
import { extractError } from '../../api/axios';

const fmt = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtShort = (n) => {
  const v = Number(n || 0);
  if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(1)}L`;
  if (v >= 1_000) return `₹${(v / 1_000).toFixed(1)}K`;
  return fmt(v);
};

const STAT_STATUS = {
  paid: { label: 'Paid', bg: 'bg-green-500' },
  partial: { label: 'Partial', bg: 'bg-amber-500' },
  unpaid: { label: 'Unpaid', bg: 'bg-red-500' },
};

const printWindow = (html) => {
  const w = window.open('', '_blank', 'width=1000,height=750');
  w.document.write(`<!DOCTYPE html><html><head><title>Vendor Statement</title><style>
    *{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:24px;color:#111;font-size:13px}
    h1{font-size:20px;margin:0 0 4px}h2{font-size:11px;margin:16px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px;text-transform:uppercase;letter-spacing:.06em;color:#666}
    .meta{display:flex;flex-wrap:wrap;gap:24px;margin-bottom:16px;background:#f9f9f9;padding:10px 14px;border-radius:6px}
    .meta-item label{display:block;color:#888;font-size:10px;text-transform:uppercase;margin-bottom:2px}.meta-item span{font-size:13px;font-weight:600}
    table{width:100%;border-collapse:collapse;margin-bottom:4px;font-size:12px}
    th{background:#f0f0f0;text-align:left;padding:6px 10px;border:1px solid #ddd;font-size:11px}td{padding:6px 10px;border:1px solid #ddd}td.r{text-align:right}
    tr.pay td{background:#f7f7ff;font-size:11px;color:#555}
    .sum{border-top:2px solid #111;padding-top:10px;margin-top:12px}.sum-row{display:flex;justify-content:space-between;padding:3px 0;font-size:13px}
    .sum-row.bold{font-weight:bold;font-size:16px;border-top:1px solid #111;margin-top:6px;padding-top:6px}
    .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold}
    .badge-paid{background:#d1fae5;color:#065f46}.badge-partial{background:#fef3c7;color:#92400e}.badge-unpaid{background:#fee2e2;color:#991b1b}
  </style></head><body>${html}</body></html>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 400);
};

// ─── Main Tab ─────────────────────────────────────────

export default function VendorsTab() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all'|'outstanding'|'clear'
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [delLoading, setDelLoading] = useState(false);
  const [statement, setStatement] = useState(null);
  const [stmtLoading, setStmtLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listVendors();
      setVendors(Array.isArray(data) ? data : (data.results || []));
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // ── dashboard stats ──
  const dash = useMemo(() => {
    if (!vendors.length) return null;
    const totalOutstanding = vendors.reduce((s, v) => s + Number(v.outstanding || 0), 0);
    const totalInvoiced = vendors.reduce((s, v) => s + Number(v.total_invoiced || 0), 0);
    const totalPaid = vendors.reduce((s, v) => s + Number(v.total_paid || 0), 0);
    const pendingCount = vendors.filter(v => Number(v.outstanding || 0) > 0).length;
    const highValue = [...vendors].sort((a, b) => Number(b.outstanding) - Number(a.outstanding))[0];
    const totalInvoices = vendors.reduce((s, v) => s + (v.invoice_stats?.total || 0), 0);
    return { totalOutstanding, totalInvoiced, totalPaid, pendingCount, highValue, totalInvoices };
  }, [vendors]);

  // ── filtered vendors ──
  const filtered = useMemo(() => {
    let r = vendors;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(v => v.vendor_name?.toLowerCase().includes(q) || v.vendor_email?.toLowerCase().includes(q));
    }
    if (statusFilter === 'outstanding') r = r.filter(v => Number(v.outstanding || 0) > 0);
    if (statusFilter === 'clear') r = r.filter(v => Number(v.outstanding || 0) === 0);
    return r;
  }, [vendors, search, statusFilter]);

  const openStatement = async (vendor) => {
    setStmtLoading(vendor.id);
    try { setStatement(await getVendorStatement(vendor.id)); }
    catch (err) { toast.error(extractError(err)); }
    finally { setStmtLoading(false); }
  };

  const onDelete = async () => {
    if (!confirmDel) return;
    setDelLoading(true);
    try {
      await deleteVendor(confirmDel.id);
      toast.success('Vendor deleted');
      setConfirmDel(null);
      load();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setDelLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendors"
        subtitle="Suppliers you purchase products from"
        actions={<Button onClick={() => setModal({ mode: 'create' })}><Plus size={16} /> Add Vendor</Button>}
      />

      {/* ── Dashboard ── */}
      {!loading && dash && <DashboardStrip dash={dash} total={vendors.length} />}

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input placeholder="Search vendors…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
        </div>
        <div className="flex items-center gap-1">
          {[
            { key: 'all', label: 'All' },
            { key: 'outstanding', label: 'Has Dues', cls: 'data-active:bg-amber-900/50 data-active:text-amber-400 data-active:border-amber-700' },
            { key: 'clear', label: 'Fully Paid', cls: 'data-active:bg-green-900/50 data-active:text-green-400 data-active:border-green-700' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setStatusFilter(key)}
              className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${statusFilter === key
                  ? key === 'outstanding' ? 'bg-amber-900/50 text-amber-400 border-amber-700'
                    : key === 'clear' ? 'bg-green-900/50 text-green-400 border-green-700'
                      : 'bg-accent/20 text-accent border-accent/50'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-border'
                }`}
            >{label}</button>
          ))}
        </div>
        {!loading && (
          <span className="text-xs text-gray-500 ml-auto">
            {filtered.length === vendors.length ? `${vendors.length} vendors` : `${filtered.length} of ${vendors.length}`}
          </span>
        )}
      </div>

      {/* ── Vendor Grid ── */}
      {loading ? <Loading /> : vendors.length === 0 ? (
        <EmptyState icon={Truck} title="No vendors yet" message="Add your first vendor to get started."
          action={<Button onClick={() => setModal({ mode: 'create' })}><Plus size={16} /> Add Vendor</Button>} />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-sm">No vendors match your filters.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((v) => (
            <VendorCard
              key={v.id}
              vendor={v}
              onEdit={() => setModal({ mode: 'edit', data: v })}
              onDelete={() => setConfirmDel(v)}
              onStatement={() => openStatement(v)}
              stmtLoading={stmtLoading === v.id}
            />
          ))}
        </div>
      )}

      <VendorFormModal modal={modal} onClose={() => setModal(null)} onSaved={load} />
      <StatementModal statement={statement} onClose={() => setStatement(null)} />
      <ConfirmDialog
        open={!!confirmDel} onClose={() => setConfirmDel(null)}
        onConfirm={onDelete} loading={delLoading}
        title={`Delete ${confirmDel?.vendor_name}?`}
        message="This action cannot be undone."
      />
    </div>
  );
}

// ─── Dashboard Strip ──────────────────────────────────

function DashboardStrip({ dash, total }) {
  const cards = [
    {
      icon: AlertTriangle,
      iconCls: 'text-amber-400 bg-amber-900/30',
      label: 'Total Outstanding',
      value: fmtShort(dash.totalOutstanding),
      sub: `across ${dash.pendingCount} of ${total} vendors`,
      highlight: Number(dash.totalOutstanding) > 0 ? 'text-amber-400' : 'text-green-400',
    },
    {
      icon: Users,
      iconCls: 'text-blue-400 bg-blue-900/30',
      label: 'Vendors with Dues',
      value: `${dash.pendingCount} / ${total}`,
      sub: `${total - dash.pendingCount} fully settled`,
      highlight: 'text-blue-400',
    },
    {
      icon: TrendingUp,
      iconCls: 'text-purple-400 bg-purple-900/30',
      label: 'Total Invoiced',
      value: fmtShort(dash.totalInvoiced),
      sub: `${fmt(dash.totalPaid)} paid · ${dash.totalInvoices} invoices`,
      highlight: 'text-purple-400',
    },
    {
      icon: Award,
      iconCls: 'text-rose-400 bg-rose-900/30',
      label: 'Highest Outstanding',
      value: dash.highValue ? fmtShort(dash.highValue.outstanding) : '—',
      sub: dash.highValue?.vendor_name || 'No outstanding',
      highlight: 'text-rose-400',
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

// ─── Vendor Card ──────────────────────────────────────

function VendorCard({ vendor, onEdit, onDelete, onStatement, stmtLoading }) {
  const stats = vendor.invoice_stats || { total: 0, paid: 0, partial: 0, unpaid: 0 };
  const outstanding = Number(vendor.outstanding || 0);
  const hasInvoices = stats.total > 0;

  const initial = vendor.vendor_name?.charAt(0)?.toUpperCase() || '?';
  const isFullyPaid = outstanding === 0 && hasInvoices;
  const hasDues = outstanding > 0;

  return (
    <div className={`bg-bg-card border rounded-2xl overflow-hidden flex flex-col transition-all hover:shadow-lg hover:shadow-black/20 ${hasDues ? 'border-amber-800/40 hover:border-amber-700/60' : 'border-border hover:border-accent/30'
      }`}>

      {/* ── Header ── */}
      <div className="p-4 flex items-start gap-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 ${hasDues ? 'bg-amber-900/40 text-amber-300' : 'bg-accent/15 text-accent'
          }`}>
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-semibold text-gray-100 text-base truncate">{vendor.vendor_name}</div>
            <span className="shrink-0 text-[10px] font-mono text-gray-600 bg-bg-elev border border-border px-1.5 py-0.5 rounded">
              #{vendor.id}
            </span>
          </div>
          {hasDues ? (
            <div className="text-xs font-medium text-amber-400 mt-0.5">{fmt(outstanding)} outstanding</div>
          ) : isFullyPaid ? (
            <div className="text-xs font-medium text-green-400 mt-0.5">All invoices paid</div>
          ) : (
            <div className="text-xs text-gray-500 mt-0.5">No invoices yet</div>
          )}
        </div>
        {hasDues && (
          <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-400 border border-amber-800 font-medium">Due</span>
        )}
        {isFullyPaid && (
          <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-800 font-medium">Paid</span>
        )}
      </div>

      {/* ── Contact Info ── */}
      <div className="px-4 pb-3 space-y-1.5 border-b border-border">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Phone size={11} className="shrink-0 text-gray-600" />
          <span className="truncate">{vendor.vendor_phone_number}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Mail size={11} className="shrink-0 text-gray-600" />
          <span className="truncate">{vendor.vendor_email}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Building2 size={11} className="shrink-0 text-gray-600" />
          <span className="truncate">GST: {vendor.vendor_gst_number}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <MapPin size={11} className="shrink-0 text-gray-600" />
          <span className="truncate">{vendor.vendor_address}</span>
        </div>
      </div>

      {/* ── Invoice Breakdown ── */}
      <div className="px-4 py-3 border-b border-border">
        {hasInvoices ? (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">{stats.total} invoice{stats.total !== 1 ? 's' : ''}</span>
              <div className="flex items-center gap-2 text-xs">
                {stats.paid > 0 && <span className="text-green-400">●&nbsp;{stats.paid} paid</span>}
                {stats.partial > 0 && <span className="text-amber-400">●&nbsp;{stats.partial} partial</span>}
                {stats.unpaid > 0 && <span className="text-red-400">●&nbsp;{stats.unpaid} unpaid</span>}
              </div>
            </div>
            <div className="flex h-1.5 rounded-full overflow-hidden bg-border gap-px">
              {stats.paid > 0 && <div className="bg-green-500 rounded-full" style={{ flex: stats.paid }} />}
              {stats.partial > 0 && <div className="bg-amber-500 rounded-full" style={{ flex: stats.partial }} />}
              {stats.unpaid > 0 && <div className="bg-red-500 rounded-full" style={{ flex: stats.unpaid }} />}
            </div>
          </>
        ) : (
          <span className="text-xs text-gray-600">No invoices recorded</span>
        )}
      </div>

      {/* ── Financial Summary ── */}
      <div className="px-4 py-3 grid grid-cols-3 gap-2 border-b border-border">
        {[
          { label: 'Invoiced', value: vendor.total_invoiced, cls: 'text-gray-300' },
          { label: 'Paid', value: vendor.total_paid, cls: 'text-green-400' },
          { label: 'Due', value: vendor.outstanding, cls: outstanding > 0 ? 'text-amber-400 font-semibold' : 'text-gray-500' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="text-center">
            <div className="text-xs text-gray-500 mb-0.5">{label}</div>
            <div className={`text-xs font-medium ${cls}`}>{fmtShort(value)}</div>
          </div>
        ))}
      </div>

      {/* ── Actions ── */}
      <div className="px-4 py-3 flex items-center justify-between mt-auto">
        <button
          onClick={onStatement}
          disabled={stmtLoading}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-accent transition-colors disabled:opacity-40"
        >
          <FileText size={13} />
          {stmtLoading ? 'Loading…' : 'Statement'}
        </button>
        <div className="flex items-center gap-1">
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-accent rounded-lg hover:bg-accent/10 transition-colors" title="Edit">
            <Pencil size={14} />
          </button>
          {/* <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-400 rounded-lg hover:bg-red-900/20 transition-colors" title="Delete">
            <Trash2 size={14} />
          </button> */}
        </div>
      </div>
    </div>
  );
}

// ─── Statement Modal ──────────────────────────────────

function StatementModal({ statement, onClose }) {
  if (!statement) return null;
  const { vendor, invoices, summary } = statement;

  const statusBadgeCls = (s) =>
    s === 'paid' ? 'bg-green-900/40 text-green-400 border border-green-800' :
      s === 'partial' ? 'bg-amber-900/40 text-amber-400 border border-amber-800' :
        'bg-red-900/40 text-red-400 border border-red-800';

  const handlePrint = () => {
    const invoiceRows = invoices.map((inv) => {
      const sc = inv.payment_status;
      const payRows = (inv.payments || []).map((p) => `
        <tr class="pay">
          <td colspan="2" style="padding-left:28px">↳ ${p.payment_date}${p.payment_reference ? ` (${p.payment_reference})` : ''}</td>
          <td colspan="2" class="r">${fmt(p.amount)}</td><td></td><td></td>
        </tr>`).join('');
      return `
        <tr>
          <td>${inv.invoice_number}</td><td>${inv.invoice_date}</td>
          <td class="r">${fmt(inv.total_amount)}</td><td class="r">${fmt(inv.total_paid)}</td>
          <td class="r">${fmt(inv.outstanding_amount)}</td>
          <td><span class="badge badge-${sc}">${sc.charAt(0).toUpperCase() + sc.slice(1)}</span></td>
        </tr>${payRows}`;
    }).join('');
    printWindow(`
      <h1>Vendor Statement</h1>
      <div class="meta">
        <div class="meta-item"><label>Vendor</label><span>${vendor.vendor_name}</span></div>
        <div class="meta-item"><label>GST</label><span>${vendor.vendor_gst_number}</span></div>
        <div class="meta-item"><label>Phone</label><span>${vendor.vendor_phone_number}</span></div>
        <div class="meta-item"><label>Email</label><span>${vendor.vendor_email}</span></div>
        <div class="meta-item"><label>Address</label><span>${vendor.vendor_address}</span></div>
      </div>
      <h2>Invoices &amp; Payments</h2>
      <table>
        <thead><tr><th>Invoice #</th><th>Date</th><th style="text-align:right">Total</th><th style="text-align:right">Paid</th><th style="text-align:right">Outstanding</th><th>Status</th></tr></thead>
        <tbody>${invoiceRows}</tbody>
      </table>
      <div class="sum">
        <div class="sum-row"><span>Total Invoiced</span><span>${fmt(summary.total_invoiced)}</span></div>
        <div class="sum-row"><span>Total Paid</span><span>${fmt(summary.total_paid)}</span></div>
        <div class="sum-row bold"><span>Outstanding Balance</span><span>${fmt(summary.outstanding)}</span></div>
      </div>`);
  };

  return (
    <Modal open={!!statement} onClose={onClose} title={`Statement — ${vendor.vendor_name}`} size="xl"
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button onClick={handlePrint}><Printer size={15} /> Download / Print</Button></>}>
      <div className="space-y-5">
        {/* vendor info */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-bg-elev rounded-lg p-3 text-sm">
          {[['Vendor', vendor.vendor_name], ['GST', vendor.vendor_gst_number], ['Phone', vendor.vendor_phone_number],
          ['Email', vendor.vendor_email], ['Address', vendor.vendor_address]].map(([l, v]) => (
            <div key={l}><div className="text-xs text-gray-500 mb-0.5">{l}</div><div className="font-medium text-gray-100 text-sm">{v}</div></div>
          ))}
        </div>
        {/* summary strip */}
        <div className="grid grid-cols-3 gap-3">
          {[['Total Invoiced', summary.total_invoiced, 'text-gray-100'],
          ['Total Paid', summary.total_paid, 'text-green-400'],
          ['Outstanding', summary.outstanding, Number(summary.outstanding) > 0 ? 'text-amber-400' : 'text-green-400']
          ].map(([l, v, cls]) => (
            <div key={l} className="bg-bg-elev rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500 mb-1">{l}</div>
              <div className={`text-lg font-semibold ${cls}`}>{fmt(v)}</div>
            </div>
          ))}
        </div>
        {/* invoices */}
        {invoices.length === 0 ? (
          <p className="text-center text-gray-500 text-sm py-4">No invoices for this vendor.</p>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="bg-bg-elev px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">Invoices &amp; Payments</div>
            <table className="w-full text-sm">
              <thead className="bg-bg-elev border-t border-border">
                <tr>
                  {['Invoice #', 'Date', 'Total', 'Paid', 'Outstanding', 'Status'].map((h, i) => (
                    <th key={h} className={`px-3 py-2 text-gray-300 font-medium ${i >= 2 && i <= 4 ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <>
                    <tr key={inv.id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium text-gray-100">{inv.invoice_number}</td>
                      <td className="px-3 py-2 text-gray-300">{inv.invoice_date}</td>
                      <td className="px-3 py-2 text-right text-gray-300">{fmt(inv.total_amount)}</td>
                      <td className="px-3 py-2 text-right text-green-400">{fmt(inv.total_paid)}</td>
                      <td className={`px-3 py-2 text-right ${Number(inv.outstanding_amount) > 0 ? 'text-amber-400' : 'text-gray-500'}`}>{fmt(inv.outstanding_amount)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusBadgeCls(inv.payment_status)}`}>
                          {inv.payment_status.charAt(0).toUpperCase() + inv.payment_status.slice(1)}
                        </span>
                      </td>
                    </tr>
                    {(inv.payments || []).map((p) => (
                      <tr key={`p-${p.id}`} className="border-t border-border/40 bg-bg-elev/30">
                        <td className="pl-8 pr-3 py-1.5 text-gray-500 text-xs" colSpan={2}>
                          ↳ {p.payment_date}{p.payment_reference ? ` · ${p.payment_reference}` : ''}
                          {p.notes ? <span className="ml-1 italic">{p.notes}</span> : null}
                        </td>
                        <td colSpan={3} className="px-3 py-1.5 text-right text-xs text-gray-300">{fmt(p.amount)}</td>
                        <td />
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Vendor Form Modal ────────────────────────────────

function VendorFormModal({ modal, onClose, onSaved }) {
  const toast = useToast();
  const empty = { vendor_name: '', vendor_phone_number: '', vendor_email: '', vendor_address: '', vendor_gst_number: '' };
  const [form, setForm] = useState(empty);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!modal) return;
    setForm(modal.mode === 'edit' ? {
      vendor_name: modal.data.vendor_name || '',
      vendor_phone_number: modal.data.vendor_phone_number || '',
      vendor_email: modal.data.vendor_email || '',
      vendor_address: modal.data.vendor_address || '',
      vendor_gst_number: modal.data.vendor_gst_number || '',
    } : empty);
    setErrors({});
    // eslint-disable-next-line
  }, [modal]);

  const f = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) });

  const submit = async (e) => {
    e.preventDefault();
    const eMap = {};
    if (!form.vendor_name.trim()) eMap.vendor_name = 'Required';
    if (!form.vendor_phone_number.trim()) eMap.vendor_phone_number = 'Required';
    if (!form.vendor_email.trim()) eMap.vendor_email = 'Required';
    if (!form.vendor_address.trim()) eMap.vendor_address = 'Required';
    if (!form.vendor_gst_number.trim()) eMap.vendor_gst_number = 'Required';
    setErrors(eMap);
    if (Object.keys(eMap).length) return;
    setSubmitting(true);
    try {
      if (modal.mode === 'edit') { await updateVendor(modal.data.id, form); toast.success('Vendor updated'); }
      else { await createVendor(form); toast.success('Vendor created'); }
      onSaved(); onClose();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={!!modal} onClose={onClose} title={modal?.mode === 'edit' ? 'Edit Vendor' : 'Add Vendor'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={submitting}>{modal?.mode === 'edit' ? 'Save' : 'Create'}</Button></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Vendor Name" required error={errors.vendor_name}>          <Input {...f('vendor_name')} /></Field>
        <Field label="Phone" required error={errors.vendor_phone_number}>  <Input {...f('vendor_phone_number')} /></Field>
        <Field label="Email" required error={errors.vendor_email}>         <Input type="email" {...f('vendor_email')} /></Field>
        <Field label="GST Number" required error={errors.vendor_gst_number}>    <Input {...f('vendor_gst_number')} /></Field>
        <Field label="Address" required error={errors.vendor_address}>       <Input {...f('vendor_address')} /></Field>
      </form>
    </Modal>
  );
}
