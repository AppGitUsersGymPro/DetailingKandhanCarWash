import { useEffect, useMemo, useRef, useState } from 'react';
import SearchableSelect from '../../components/SearchableSelect';
import { createPortal } from 'react-dom';
import { Plus, Receipt, Trash2, Eye, CreditCard, Printer, X, Download, FileSpreadsheet, Search } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import Table from '../../components/Table';
import Modal from '../../components/Modal';
import { Field, Input, Select, Textarea } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { listInvoices, createInvoice, getInvoice, createPayment } from '../../api/invoices';
import { listVendors } from '../../api/vendors';
import { listProducts } from '../../api/products';
import { listInventory } from '../../api/inventory';
import { extractError } from '../../api/axios';
import { downloadInvoicePdf, exportInvoicesExcel } from '../../utils/export';

const fmt = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_CFG = {
  paid:    { label: 'Paid',    cls: 'bg-green-900/40 text-green-400 border border-green-800' },
  partial: { label: 'Partial', cls: 'bg-amber-900/40 text-amber-400 border border-amber-800' },
  unpaid:  { label: 'Unpaid',  cls: 'bg-red-900/40 text-red-400 border border-red-800' },
};

function StatusBadge({ status }) {
  const c = STATUS_CFG[status] || STATUS_CFG.unpaid;
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${c.cls}`}>{c.label}</span>;
}

const METHOD_CFG = {
  cash:       { label: 'Cash',        cls: 'bg-green-900/30 text-green-400 border-green-800' },
  upi:        { label: 'UPI',         cls: 'bg-purple-900/30 text-purple-400 border-purple-800' },
  card:       { label: 'Card',        cls: 'bg-blue-900/30 text-blue-400 border-blue-800' },
  netbanking: { label: 'Net Banking', cls: 'bg-cyan-900/30 text-cyan-400 border-cyan-800' },
  cheque:     { label: 'Cheque',      cls: 'bg-amber-900/30 text-amber-400 border-amber-800' },
  other:      { label: 'Other',       cls: 'bg-gray-700/40 text-gray-400 border-gray-600' },
};

function MethodBadge({ method }) {
  const c = METHOD_CFG[method] || METHOD_CFG.other;
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${c.cls}`}>{c.label}</span>;
}

const printWindow = (html) => {
  const w = window.open('', '_blank', 'width=900,height=700');
  w.document.write(`<!DOCTYPE html><html><head><title>Print</title><style>
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;margin:24px;color:#111;font-size:13px}
    h1{font-size:20px;margin:0 0 4px}
    h2{font-size:11px;margin:16px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px;text-transform:uppercase;letter-spacing:.06em;color:#666}
    .meta{display:flex;flex-wrap:wrap;gap:24px;margin-bottom:16px;background:#f9f9f9;padding:10px 14px;border-radius:6px}
    .meta-item label{display:block;color:#888;font-size:10px;text-transform:uppercase;margin-bottom:2px}
    .meta-item span{font-size:13px;font-weight:600}
    table{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:12px}
    th{background:#f0f0f0;text-align:left;padding:6px 10px;border:1px solid #ddd;font-size:11px}
    td{padding:6px 10px;border:1px solid #ddd}
    td.r{text-align:right}
    tr.hi td{background:#fffbeb;font-weight:600}
    .sum{border-top:1px solid #ccc;padding-top:10px;margin-top:4px}
    .sum-row{display:flex;justify-content:space-between;padding:3px 0;font-size:13px}
    .sum-row.bold{font-weight:bold;font-size:15px;border-top:1px solid #111;margin-top:6px;padding-top:6px}
    .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold}
    .badge-paid{background:#d1fae5;color:#065f46}
    .badge-partial{background:#fef3c7;color:#92400e}
    .badge-unpaid{background:#fee2e2;color:#991b1b}
  </style></head><body>${html}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
};

// ─── Main Tab ─────────────────────────────────────────

export default function InvoicesTab() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewInvoice, setViewInvoice] = useState(null);
  const [payModal, setPayModal] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);
  const [inventoryBrands, setInventoryBrands] = useState([]);

  // ── filters ──
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [vendorFilter, setVendorFilter] = useState('');  // vendor id as string, '' = all
  const [dateMode, setDateMode] = useState('all');   // 'all' | 'single' | 'range' | 'month'
  const [singleDate, setSingleDate] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');

  const resetFilters = () => {
    setSearch(''); setStatusFilter('all'); setVendorFilter('');
    setDateMode('all'); setSingleDate('');
    setDateFrom(''); setDateTo(''); setSelectedMonth('');
  };

  const hasFilters = search.trim() || statusFilter !== 'all' || vendorFilter ||
    (dateMode !== 'all' && (singleDate || dateFrom || dateTo || selectedMonth));

  const filteredInvoices = useMemo(() => {
    let r = invoices;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter((inv) =>
        inv.invoice_number?.toLowerCase().includes(q) ||
        inv.vendor_invoice_id?.toLowerCase().includes(q) ||
        inv.vendor_name?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') r = r.filter((inv) => inv.payment_status === statusFilter);
    if (vendorFilter) {
      r = r.filter((inv) => String(inv.vendor) === vendorFilter);
    }
    if (dateMode === 'single' && singleDate) {
      r = r.filter((inv) => inv.invoice_date === singleDate);
    } else if (dateMode === 'range' && (dateFrom || dateTo)) {
      r = r.filter((inv) => {
        if (dateFrom && inv.invoice_date < dateFrom) return false;
        if (dateTo && inv.invoice_date > dateTo) return false;
        return true;
      });
    } else if (dateMode === 'month' && selectedMonth) {
      r = r.filter((inv) => inv.invoice_date?.startsWith(selectedMonth));
    }
    return r;
  }, [invoices, search, statusFilter, vendorFilter, dateMode, singleDate, dateFrom, dateTo, selectedMonth]);

  const load = async () => {
    setLoading(true);
    try {
      const [inv, vs, ps, invItems] = await Promise.all([
        listInvoices(), listVendors(), listProducts(), listInventory(),
      ]);
      setInvoices(Array.isArray(inv) ? inv : (inv.results || []));
      setVendors(Array.isArray(vs) ? vs : (vs.results || []));
      setProducts(Array.isArray(ps) ? ps : (ps.results || []));
      const items = Array.isArray(invItems) ? invItems : (invItems.results || []);
      const seen = new Set();
      for (const it of items) { if (it.brand?.trim()) seen.add(it.brand.trim()); }
      setInventoryBrands([...seen].sort());
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const openView = async (id) => {
    try { setViewInvoice(await getInvoice(id)); } catch (err) { toast.error(extractError(err)); }
  };

  const handlePaySuccess = (invoice, newPaymentId) => {
    setPayModal(null);
    setReceipt({ invoice, newPaymentId });
    load();
  };

  const columns = [
    { key: 'invoice_number', header: 'Invoice #', render: (r) => <span className="font-medium font-mono text-xs text-gray-100">{r.invoice_number}</span> },
    {
      key: 'vendor_invoice_id', header: 'Vendor Ref',
      render: (r) => r.vendor_invoice_id
        ? <span className="text-gray-300 text-xs">{r.vendor_invoice_id}</span>
        : <span className="text-gray-600">—</span>,
    },
    { key: 'vendor_name', header: 'Vendor' },
    { key: 'invoice_date', header: 'Date' },
    { key: 'total_amount', header: 'Total', render: (r) => fmt(r.total_amount) },
    { key: 'total_paid', header: 'Paid', render: (r) => <span className="text-green-400">{fmt(r.total_paid)}</span> },
    {
      key: 'outstanding_amount', header: 'Outstanding',
      render: (r) => (
        <span className={Number(r.outstanding_amount) > 0 ? 'text-amber-400' : 'text-gray-500'}>
          {fmt(r.outstanding_amount)}
        </span>
      ),
    },
    { key: 'payment_status', header: 'Status', render: (r) => <StatusBadge status={r.payment_status} /> },
    {
      key: 'actions', header: '',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <button onClick={() => openView(r.id)} className="p-1.5 text-gray-400 hover:text-accent" title="View invoice">
            <Eye size={14} />
          </button>
          <button
            onClick={() => downloadInvoicePdf(r)}
            className="p-1.5 text-gray-400 hover:text-blue-400" title="Download PDF"
          >
            <Download size={14} />
          </button>
          {r.payment_status !== 'paid' && (
            <button onClick={() => setPayModal({ invoice: r })} className="p-1.5 text-gray-400 hover:text-green-400" title="Record Payment">
              <CreditCard size={14} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Purchase invoices from your vendors"
        actions={<Button onClick={() => setCreateOpen(true)}><Plus size={16} /> New Invoice</Button>}
      />

      {/* ── Filter Bar ── */}
      <div className="bg-bg-card border border-border rounded-xl p-4 mb-4 space-y-3">
        {/* Row 0: search */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice #, vendor ref, vendor name…"
            className="w-full bg-bg-elev border border-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent"
          />
        </div>

        {/* Row 1: vendor dropdown + status chips */}
        <div className="flex flex-wrap items-center gap-3">
          <SearchableSelect
            value={vendorFilter}
            onChange={setVendorFilter}
            options={[
              { value: '', label: 'All vendors' },
              ...vendors.map(v => ({ value: String(v.id), label: v.vendor_name })),
            ]}
            placeholder="All vendors"
            className="flex-1 min-w-[180px]"
          />

          <div className="flex items-center gap-1">
            {[
              { key: 'all',     label: 'All' },
              { key: 'paid',    label: 'Paid',    active: 'bg-green-900/50 text-green-400 border-green-700' },
              { key: 'partial', label: 'Partial', active: 'bg-amber-900/50 text-amber-400 border-amber-700' },
              { key: 'unpaid',  label: 'Unpaid',  active: 'bg-red-900/50 text-red-400 border-red-700' },
            ].map(({ key, label, active }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                  statusFilter === key
                    ? active || 'bg-accent/20 text-accent border-accent/50'
                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-border'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {hasFilters && (
            <button onClick={resetFilters} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 ml-auto">
              <X size={12} /> Clear filters
            </button>
          )}
        </div>

        {/* Row 2: date filters */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">Date:</span>
          {['all', 'single', 'range', 'month'].map((m) => (
            <button
              key={m}
              onClick={() => { setDateMode(m); setSingleDate(''); setDateFrom(''); setDateTo(''); setSelectedMonth(''); }}
              className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                dateMode === m
                  ? 'bg-accent/20 text-accent border-accent/50'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-border'
              }`}
            >
              {{ all: 'All', single: 'Single date', range: 'Date range', month: 'Monthly' }[m]}
            </button>
          ))}

          {dateMode === 'single' && (
            <input type="date" value={singleDate} onChange={(e) => setSingleDate(e.target.value)}
              className="ml-2 bg-bg-elev border border-border rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent" />
          )}
          {dateMode === 'range' && (
            <div className="flex items-center gap-2 ml-2">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="bg-bg-elev border border-border rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent" />
              <span className="text-xs text-gray-500">to</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="bg-bg-elev border border-border rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent" />
            </div>
          )}
          {dateMode === 'month' && (
            <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
              className="ml-2 bg-bg-elev border border-border rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent" />
          )}

          <div className="ml-auto flex items-center gap-3">
            {!loading && hasFilters && (
              <span className="text-xs text-gray-500">
                {filteredInvoices.length} of {invoices.length} invoices
              </span>
            )}
            {!loading && filteredInvoices.length > 0 && (
              <button
                onClick={() => exportInvoicesExcel(filteredInvoices)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border border-border text-gray-400 hover:text-green-400 hover:border-green-700 transition-colors"
                title="Export current view to Excel"
              >
                <FileSpreadsheet size={13} /> Export Excel
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? <Loading /> : invoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No invoices yet"
          message="Create an invoice to add stock to your inventory."
          action={<Button onClick={() => setCreateOpen(true)}><Plus size={16} /> New Invoice</Button>}
        />
      ) : filteredInvoices.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">No invoices match the current filters.</div>
      ) : (
        <>
          <div className="hidden xl:block">
            <Table columns={columns} rows={filteredInvoices} />
          </div>
          <div className="flex flex-col gap-2 xl:hidden">
            {filteredInvoices.map((r) => (
              <div key={r.id} className="bg-bg-card border border-border rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-mono font-semibold text-gray-100">{r.invoice_number}</span>
                      <StatusBadge status={r.payment_status} />
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{r.vendor_name}</div>
                    {r.vendor_invoice_id && <div className="text-[10px] text-gray-500">Ref: {r.vendor_invoice_id}</div>}
                  </div>
                  <div className="text-xs text-gray-500 shrink-0 text-right">{r.invoice_date}</div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-border text-xs">
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Total</div>
                    <div className="font-semibold text-gray-100">{fmt(r.total_amount)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Paid</div>
                    <div className="text-green-400 font-medium">{fmt(r.total_paid)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Outstanding</div>
                    <div className={Number(r.outstanding_amount) > 0 ? 'text-amber-400 font-medium' : 'text-gray-500'}>{fmt(r.outstanding_amount)}</div>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-border">
                  <button onClick={() => openView(r.id)} className="p-1.5 text-gray-400 hover:text-accent" title="View"><Eye size={14} /></button>
                  <button onClick={() => downloadInvoicePdf(r)} className="p-1.5 text-gray-400 hover:text-blue-400" title="Download"><Download size={14} /></button>
                  {r.payment_status !== 'paid' && (
                    <button onClick={() => setPayModal({ invoice: r })} className="p-1.5 text-gray-400 hover:text-green-400" title="Pay"><CreditCard size={14} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <CreateInvoiceModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={load} vendors={vendors} products={products} brands={inventoryBrands} />
      <ViewInvoiceModal invoice={viewInvoice} onClose={() => setViewInvoice(null)} />
      <PayInvoiceModal modal={payModal} onClose={() => setPayModal(null)} onSuccess={handlePaySuccess} />
      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}

// ─── Pay Invoice Modal ────────────────────────────────

function PayInvoiceModal({ modal, onClose, onSuccess }) {
  const toast = useToast();
  const invoice = modal?.invoice;
  const outstanding = Number(invoice?.outstanding_amount || 0);

  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!modal) return;
    setAmount('');
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod('cash');
    setReference('');
    setNotes('');
    setErrors({});
  }, [modal]);

  const submit = async (e) => {
    e.preventDefault();
    const eMap = {};
    const amt = Number(amount);
    if (!amount || isNaN(amt) || amt <= 0) eMap.amount = 'Enter a valid amount greater than 0';
    else if (amt > outstanding) eMap.amount = `Cannot exceed outstanding ${fmt(outstanding)}`;
    if (!paymentDate) eMap.paymentDate = 'Required';
    setErrors(eMap);
    if (Object.keys(eMap).length) return;

    setSubmitting(true);
    try {
      const res = await createPayment(invoice.id, {
        amount: amt,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        payment_reference: reference.trim(),
        notes: notes.trim(),
      });
      toast.success('Payment recorded');
      onSuccess(res.invoice, res.payment.id);
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!invoice) return null;

  return (
    <Modal
      open={!!modal}
      onClose={onClose}
      title={`Record Payment — ${invoice.invoice_number}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={submitting}>Record Payment</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3 bg-bg-elev rounded-lg p-3 text-sm">
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Invoice Total</div>
            <div className="font-medium text-gray-100">{fmt(invoice.total_amount)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Already Paid</div>
            <div className="font-medium text-green-400">{fmt(invoice.total_paid)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Outstanding</div>
            <div className="font-medium text-amber-400">{fmt(outstanding)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount (₹)" required error={errors.amount} hint={`Max: ${fmt(outstanding)}`}>
            <Input type="number" step="0.01" min="0.01" max={outstanding} value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Payment Date" required error={errors.paymentDate}>
            <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Payment Method" required>
            <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="netbanking">Net Banking</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Reference #" hint="UPI ID, cheque no., txn ID…">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
          </Field>
        </div>

        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes…" />
        </Field>
      </div>
    </Modal>
  );
}

// ─── Receipt Modal ────────────────────────────────────

function ReceiptModal({ receipt, onClose }) {
  if (!receipt) return null;
  const { invoice, newPaymentId } = receipt;

  const handlePrint = () => {
    const methodLabel = { cash: 'Cash', upi: 'UPI', card: 'Card', netbanking: 'Net Banking', cheque: 'Cheque', other: 'Other' };
    const rows = (invoice.payments || []).map((p) => `
      <tr class="${p.id === newPaymentId ? 'hi' : ''}">
        <td>${p.payment_date}</td>
        <td>${methodLabel[p.payment_method] || p.payment_method || '—'}</td>
        <td>${p.payment_reference || '—'}</td>
        <td>${p.notes || '—'}</td>
        <td class="r">${fmt(p.amount)}</td>
      </tr>`).join('');

    printWindow(`
      <h1>Payment Receipt</h1>
      <div class="meta">
        <div class="meta-item"><label>Invoice #</label><span>${invoice.invoice_number}</span></div>
        <div class="meta-item"><label>Vendor</label><span>${invoice.vendor_name}</span></div>
        <div class="meta-item"><label>Invoice Date</label><span>${invoice.invoice_date}</span></div>
      </div>
      <h2>Payment Installments</h2>
      <table>
        <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th>Notes</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="sum">
        <div class="sum-row"><span>Invoice Total</span><span>${fmt(invoice.total_amount)}</span></div>
        <div class="sum-row"><span>Total Paid</span><span>${fmt(invoice.total_paid)}</span></div>
        <div class="sum-row bold"><span>Outstanding</span><span>${fmt(invoice.outstanding_amount)}</span></div>
      </div>`);
  };

  return (
    <Modal
      open={!!receipt}
      onClose={onClose}
      title={`Payment Receipt — ${invoice.invoice_number}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button onClick={handlePrint}><Printer size={15} /> Print Receipt</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3 bg-bg-elev rounded-lg p-3 text-sm">
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Invoice #</div>
            <div className="font-medium text-gray-100">{invoice.invoice_number}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Vendor</div>
            <div className="font-medium text-gray-100">{invoice.vendor_name}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Invoice Date</div>
            <div className="font-medium text-gray-100">{invoice.invoice_date}</div>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Payment Installments</h3>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg-elev">
                <tr>
                  <th className="text-left px-3 py-2 text-gray-300 font-medium">Date</th>
                  <th className="text-left px-3 py-2 text-gray-300 font-medium">Method</th>
                  <th className="text-left px-3 py-2 text-gray-300 font-medium">Reference</th>
                  <th className="text-left px-3 py-2 text-gray-300 font-medium">Notes</th>
                  <th className="text-right px-3 py-2 text-gray-300 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.payments || []).map((p) => (
                  <tr key={p.id} className={`border-t border-border ${p.id === newPaymentId ? 'bg-amber-900/20' : ''}`}>
                    <td className="px-3 py-2 text-gray-200">{p.payment_date}</td>
                    <td className="px-3 py-2"><MethodBadge method={p.payment_method} /></td>
                    <td className="px-3 py-2 text-gray-400">{p.payment_reference || '—'}</td>
                    <td className="px-3 py-2 text-gray-400 max-w-[120px] truncate">{p.notes || '—'}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-100">{fmt(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="border-t border-border pt-3 space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-400">
            <span>Invoice Total</span><span>{fmt(invoice.total_amount)}</span>
          </div>
          <div className="flex justify-between text-green-400">
            <span>Total Paid</span><span>{fmt(invoice.total_paid)}</span>
          </div>
          <div className="flex justify-between font-semibold text-base border-t border-border pt-2 mt-2">
            <span className="text-gray-100">Outstanding</span>
            <span className={Number(invoice.outstanding_amount) > 0 ? 'text-amber-400' : 'text-green-400'}>
              {fmt(invoice.outstanding_amount)}
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── View Invoice Modal ───────────────────────────────

function ViewInvoiceModal({ invoice, onClose }) {
  return (
    <Modal
      open={!!invoice} onClose={onClose} size="lg"
      title={invoice ? `Invoice ${invoice.invoice_number}` : ''}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {invoice && (
            <Button onClick={() => downloadInvoicePdf(invoice)}>
              <Download size={15} /> Download PDF
            </Button>
          )}
        </>
      }
    >
      {invoice && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-xs text-gray-500">Vendor</div><div className="text-gray-200">{invoice.vendor_name}</div></div>
            <div><div className="text-xs text-gray-500">Invoice Date</div><div className="text-gray-200">{invoice.invoice_date}</div></div>
            <div><div className="text-xs text-gray-500">Invoice #</div><div className="font-mono text-gray-300 text-xs">{invoice.invoice_number}</div></div>
            {invoice.vendor_invoice_id && (
              <div><div className="text-xs text-gray-500">Vendor Ref #</div><div className="text-gray-200">{invoice.vendor_invoice_id}</div></div>
            )}
          </div>

          <div className="border border-border rounded-lg overflow-hidden">
            <div className="bg-bg-elev px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">Items</div>
            <table className="w-full text-sm">
              <thead className="bg-bg-elev border-t border-border">
                <tr>
                  <th className="text-left px-3 py-2 text-gray-300 font-medium">Product</th>
                  <th className="text-right px-3 py-2 text-gray-300 font-medium">Amt/pkg</th>
                  <th className="text-right px-3 py-2 text-gray-300 font-medium">Qty</th>
                  <th className="text-right px-3 py-2 text-gray-300 font-medium">Cost/pkg</th>
                  <th className="text-left px-3 py-2 text-gray-300 font-medium">Brand</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.items || []).map((it) => (
                  <tr key={it.id} className="border-t border-border">
                    <td className="px-3 py-2 text-gray-200">{it.product_name}</td>
                    <td className="px-3 py-2 text-right text-gray-400">{it.unit_amount != null ? it.unit_amount : 1}</td>
                    <td className="px-3 py-2 text-right text-gray-200">{it.quantity}</td>
                    <td className="px-3 py-2 text-right text-gray-200">{fmt(it.unit_price)}</td>
                    <td className="px-3 py-2 text-gray-200">{it.product_brand || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(invoice.payments || []).length > 0 && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="bg-bg-elev px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">Payment Installments</div>
              <table className="w-full text-sm">
                <thead className="bg-bg-elev border-t border-border">
                  <tr>
                    <th className="text-left px-3 py-2 text-gray-300 font-medium">Date</th>
                    <th className="text-left px-3 py-2 text-gray-300 font-medium">Method</th>
                    <th className="text-left px-3 py-2 text-gray-300 font-medium">Reference</th>
                    <th className="text-right px-3 py-2 text-gray-300 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.payments.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-3 py-2 text-gray-200">{p.payment_date}</td>
                      <td className="px-3 py-2"><MethodBadge method={p.payment_method} /></td>
                      <td className="px-3 py-2 text-gray-400">{p.payment_reference || '—'}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-100">{fmt(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end gap-6 pt-2 text-sm border-t border-border">
            <div className="text-right">
              <div className="text-xs text-gray-500">Total Paid</div>
              <div className="font-medium text-green-400">{fmt(invoice.total_paid)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500">Outstanding</div>
              <div className={`font-medium ${Number(invoice.outstanding_amount) > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                {fmt(invoice.outstanding_amount)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500">Total</div>
              <div className="text-lg font-semibold text-gray-100">{fmt(invoice.total_amount)}</div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Create Invoice Modal ─────────────────────────────

function CreateInvoiceModal({ open, onClose, onSaved, vendors, products, brands }) {
  const toast = useToast();
  const emptyItem = { product: '', unit_amount: '', quantity: '', unit_price: '', product_brand: '' };
  const [vendorId, setVendorId] = useState('');
  const [vendorInvoiceId, setVendorInvoiceId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setVendorId(''); setVendorInvoiceId('');
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setItems([{ ...emptyItem }]); setErrors({});
    // eslint-disable-next-line
  }, [open]);

  const updateItem = (i, k, v) => setItems((arr) => arr.map((row, idx) => idx === i ? { ...row, [k]: v } : row));
  const addRow = () => setItems((arr) => [...arr, { ...emptyItem }]);
  const removeRow = (i) => setItems((arr) => arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr);

  const selectProduct = (i, productId) => {
    setItems(arr => arr.map((row, idx) => idx !== i ? row : { ...row, product: productId, unit_amount: '' }));
  };

  const getProductUnit = (productId) => {
    const p = products.find(p => String(p.id) === String(productId));
    return p?.product_unit || '';
  };

  const total = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);

  const submit = async (e) => {
    e.preventDefault();
    const eMap = {};
    if (!vendorId) eMap.vendor = 'Select vendor';
    if (!invoiceDate) eMap.invoice_date = 'Required';
    const validItems = items.filter((it) => it.product && it.quantity && it.unit_price);
    if (validItems.length === 0) eMap.items = 'Add at least one item';
    setErrors(eMap);
    if (Object.keys(eMap).length) return;

    setSubmitting(true);
    try {
      await createInvoice({
        vendor: Number(vendorId),
        vendor_invoice_id: vendorInvoiceId.trim(),
        invoice_date: invoiceDate,
        total_amount: total,
        items: validItems.map((it) => ({
          product: Number(it.product),
          unit_amount: it.unit_amount ? Number(it.unit_amount) : 1,
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          product_brand: it.product_brand || '',
        })),
      });
      toast.success('Invoice created. Inventory updated.');
      onSaved(); onClose();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open} onClose={onClose} title="New Invoice" size="xl"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={submitting}>Create Invoice</Button></>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Vendor" required error={errors.vendor}>
            <SearchableSelect
              value={String(vendorId)}
              onChange={setVendorId}
              options={[
                { value: '', label: 'Select vendor…' },
                ...vendors.map(v => ({ value: String(v.id), label: v.vendor_name })),
              ]}
              placeholder="Select vendor…"
            />
          </Field>
          <Field label="Invoice Date" required error={errors.invoice_date}>
            <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </Field>
          <Field label="Vendor Invoice ID" hint="Reference # from the vendor (optional)">
            <Input value={vendorInvoiceId} onChange={(e) => setVendorInvoiceId(e.target.value)} placeholder="e.g. INV-2025-001" />
          </Field>
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          <div className="bg-bg-elev px-4 py-2.5 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-100">Items</h3>
            <Button size="sm" variant="secondary" onClick={addRow}><Plus size={12} /> Add Row</Button>
          </div>
          <div className="divide-y divide-border">
            {items.map((it, idx) => {
              const unit = getProductUnit(it.product);
              const unitAmountLabel = idx === 0
                ? (unit ? `Amt / pkg (${unit})` : 'Amt / pkg')
                : null;
              return (
              <div key={idx} className="grid grid-cols-12 gap-2 p-3 items-end">
                {/* Product */}
                <div className="col-span-12 md:col-span-3">
                  <Field label={idx === 0 ? 'Product' : null}>
                    <SearchableSelect
                      value={String(it.product)}
                      onChange={(v) => selectProduct(idx, v)}
                      options={[
                        { value: '', label: 'Select product…' },
                        ...products.map(p => ({ value: String(p.id), label: `${p.product_name} (${p.product_unit})` })),
                      ]}
                      placeholder="Select product…"
                    />
                  </Field>
                </div>
                {/* Brand */}
                <div className="col-span-12 md:col-span-2">
                  <Field label={idx === 0 ? 'Brand' : null}>
                    <BrandCombobox
                      value={it.product_brand}
                      onChange={(v) => updateItem(idx, 'product_brand', v)}
                      brands={brands}
                    />
                  </Field>
                </div>
                {/* Unit Amount */}
                <div className="col-span-6 md:col-span-2">
                  <Field label={unitAmountLabel}>
                    <Input
                      type="number" step="0.01" min="0.01"
                      value={it.unit_amount}
                      onChange={(e) => updateItem(idx, 'unit_amount', e.target.value)}
                      placeholder="e.g. 500"
                    />
                  </Field>
                </div>
                {/* Qty */}
                <div className="col-span-6 md:col-span-2">
                  <Field label={idx === 0 ? 'Qty (pkgs)' : null}>
                    <Input type="number" step="0.01" value={it.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} />
                  </Field>
                </div>
                {/* Cost price */}
                <div className="col-span-6 md:col-span-2">
                  <Field label={idx === 0 ? 'Cost / pkg (₹)' : null}>
                    <Input type="number" step="0.01" value={it.unit_price} onChange={(e) => updateItem(idx, 'unit_price', e.target.value)} />
                  </Field>
                </div>
                {/* Delete */}
                <div className="col-span-12 md:col-span-1 flex justify-end">
                  <button type="button" onClick={() => removeRow(idx)} disabled={items.length === 1}
                    className="text-gray-400 hover:text-red-400 disabled:opacity-30 p-2">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              );
            })}
          </div>
          {errors.items && <div className="px-4 py-2 text-xs text-red-400">{errors.items}</div>}
        </div>

        <div className="flex justify-end items-center gap-3 pt-2">
          <span className="text-sm text-gray-400">Total:</span>
          <span className="text-xl font-semibold text-gray-100">{fmt(total)}</span>
        </div>
      </div>
    </Modal>
  );
}

// ─── Brand Combobox ───────────────────────────────────
// Uses a portal so the dropdown escapes overflow-hidden ancestors (modal, table).

function BrandCombobox({ value, onChange, brands }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const wrapRef = useRef(null);

  const reposition = () => {
    if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      setPos({ top: r.bottom, left: r.left, width: r.width });
    }
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Reposition when open and user scrolls inside the modal
  useEffect(() => {
    if (!open) return;
    const handler = () => reposition();
    window.addEventListener('scroll', handler, true);
    return () => window.removeEventListener('scroll', handler, true);
  }, [open]);

  const suggestions = useMemo(() => {
    if (!value.trim()) return brands;
    const q = value.trim().toLowerCase();
    return brands.filter(b => b.toLowerCase().includes(q));
  }, [value, brands]);

  const dropdown = open && suggestions.length > 0 && createPortal(
    <ul
      style={{ position: 'fixed', top: pos.top + 4, left: pos.left, width: pos.width, zIndex: 9999 }}
      className="bg-bg-card border border-border rounded-lg shadow-2xl overflow-hidden max-h-48 overflow-y-auto"
    >
      {suggestions.map((b) => (
        <li key={b}>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();   // keep input focused
              onChange(b);
              setOpen(false);
            }}
            className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-bg-elev ${
              value === b ? 'text-accent bg-accent/10' : 'text-gray-200'
            }`}
          >
            {b}
          </button>
        </li>
      ))}
    </ul>,
    document.body,
  );

  return (
    <div ref={wrapRef}>
      <Input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); reposition(); }}
        onFocus={() => { setOpen(true); reposition(); }}
        placeholder="Type or pick a brand…"
      />
      {dropdown}
    </div>
  );
}
