import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ShoppingCart, Plus, Download, Trash2, Search,
  TrendingUp, TrendingDown, Users, IndianRupee, Package,
  X, ChevronDown, ChevronUp,
} from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { Field, Input, Select } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { getSalesAnalytics, createSalesOrder, deleteSalesOrder, lookupCustomer } from '../../api/sales';
import { listSalesInventory } from '../../api/jobcards';
import { extractError } from '../../api/axios';
import { downloadSalesInvoice } from '../../utils/salesInvoice';
import { openWhatsAppForSale } from '../../utils/jobcard';
import UpiQr from '../../components/UpiQr';

const WaIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtD = (s) => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const METHOD_LABEL = { cash: 'Cash', upi: 'UPI', card: 'Card', netbanking: 'Net Banking', cheque: 'Cheque', other: 'Other' };
const localToday = () => new Date().toISOString().slice(0, 10);

// ─── Tiny horizontal-bar chart ────────────────────────────────────────────────
function BarChart({ rows, valueKey = 'revenue', labelKey = 'name', color = '#38bdf8', title }) {
  if (!rows || rows.length === 0)
    return <div className="text-xs text-gray-500 py-4 text-center">No data yet</div>;
  const max = Math.max(...rows.map(r => Number(r[valueKey] || 0)));
  return (
    <div>
      {title && <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</div>}
      <div className="space-y-2.5">
        {rows.map((r, i) => {
          const val = Number(r[valueKey] || 0);
          const qty = Number(r.quantity || 0);
          const pct = max > 0 ? (val / max) * 100 : 0;
          return (
            <div key={i}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-gray-300 truncate max-w-[55%]">{r[labelKey]}{r.brand ? ` · ${r.brand}` : ''}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-gray-500">{qty} unit{qty !== 1 ? 's' : ''}</span>
                  <span style={{ color }} className="font-medium">{fmt(val)}</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-bg-elev overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, color = 'text-accent' }) {
  return (
    <div className="bg-bg-card border border-border rounded-xl p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-bg-elev flex items-center justify-center shrink-0">
        <Icon size={17} className={color} />
      </div>
      <div>
        <div className="text-xs text-gray-500 mb-0.5">{label}</div>
        <div className="text-lg font-bold text-gray-100">{value}</div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SalesPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [feed, setFeed] = useState([]);
  const [newSaleOpen, setNewSaleOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);   // { id, order_number }
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');     // '' | 'standalone' | 'job_card'
  const [expandedRow, setExpandedRow] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getSalesAnalytics();
      setAnalytics(data.analytics || {});
      setFeed(Array.isArray(data.feed) ? data.feed : []);
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const filtered = useMemo(() => {
    let list = feed;
    if (typeFilter) list = list.filter(r => r.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        (r.customer_name || '').toLowerCase().includes(q) ||
        (r.phone_number || '').toLowerCase().includes(q) ||
        (r.order_number || '').toLowerCase().includes(q) ||
        (r.vehicle_number || '').toLowerCase().includes(q) ||
        (r.items || []).some(it => (it.product_name || '').toLowerCase().includes(q))
      );
    }
    return list;
  }, [feed, search, typeFilter]);

  const onDeleteConfirmed = async () => {
    if (!confirmDel) return;
    try {
      await deleteSalesOrder(confirmDel.id);
      toast.success('Sale deleted — inventory restored');
      setConfirmDel(null);
      await load();
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  const a = analytics || {};
  const totalTx = (a.standalone_count || 0) + (a.jc_count || 0);

  return (
    <div>
      <PageHeader
        title="Sales"
        subtitle="Retail product sales — standalone and via job cards"
        actions={
          <Button onClick={() => setNewSaleOpen(true)}>
            <Plus size={16} /> New Sale
          </Button>
        }
      />

      {loading ? <Loading /> : (
        <>
          {/* ── KPI row ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <KpiCard icon={IndianRupee} label="Total Sales Revenue" value={fmt(a.total_revenue)} color="text-emerald-400" />
            <KpiCard icon={IndianRupee} label="Today's Revenue" value={fmt(a.today_revenue)} color="text-yellow-400" />
            <KpiCard icon={ShoppingCart} label="Direct Sales" value={a.standalone_count || 0} color="text-blue-400" />
            <KpiCard icon={Package} label="Via Job Cards" value={a.jc_count || 0} color="text-violet-400" />
          </div>

          {/* ── Charts row ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">

            {/* Top products */}
            <div className="bg-bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={15} className="text-emerald-400" />
                <span className="text-sm font-semibold text-gray-100">Top Selling Products</span>
              </div>
              <BarChart rows={a.top_products || []} valueKey="revenue" labelKey="name" color="#34d399" />
            </div>

            {/* Low selling products */}
            <div className="bg-bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown size={15} className="text-amber-400" />
                <span className="text-sm font-semibold text-gray-100">Least Selling Products</span>
              </div>
              <BarChart rows={a.bottom_products || []} valueKey="revenue" labelKey="name" color="#fbbf24" />
            </div>

            {/* Right column: sales by type + top customers */}
            <div className="space-y-4">
              {/* Sales by type */}
              <div className="bg-bg-card border border-border rounded-xl p-5">
                <div className="text-sm font-semibold text-gray-100 mb-3">Sales by Source</div>
                {(() => {
                  const sbt = a.sales_by_type || {};
                  const sa = sbt.standalone || {};
                  const jc = sbt.job_card || {};
                  const tot = Number(sa.revenue || 0) + Number(jc.revenue || 0);
                  const saP = tot > 0 ? (Number(sa.revenue || 0) / tot * 100).toFixed(0) : 0;
                  const jcP = tot > 0 ? (Number(jc.revenue || 0) / tot * 100).toFixed(0) : 0;
                  return (
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-blue-300">Direct Sales ({sa.count || 0})</span>
                          <span className="text-blue-400">{fmt(sa.revenue)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-bg-elev">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${saP}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-violet-300">Via Job Card ({jc.count || 0})</span>
                          <span className="text-violet-400">{fmt(jc.revenue)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-bg-elev">
                          <div className="h-full rounded-full bg-violet-500" style={{ width: `${jcP}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Top customers */}
              <div className="bg-bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Users size={15} className="text-sky-400" />
                  <span className="text-sm font-semibold text-gray-100">Top Customers</span>
                </div>
                {(a.top_customers || []).length === 0
                  ? <div className="text-xs text-gray-500">No data yet</div>
                  : <div className="space-y-2">
                    {(a.top_customers || []).map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div>
                          <div className="text-gray-200">{c.name}</div>
                          {c.phone && <div className="text-gray-500">{c.phone}</div>}
                        </div>
                        <div className="text-right">
                          <div className="text-emerald-400 font-semibold">{fmt(c.spent)}</div>
                          <div className="text-gray-500">{c.count} order{c.count !== 1 ? 's' : ''}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                }
              </div>
            </div>
          </div>

          {/* ── Filter bar ── */}
          <div className="bg-bg-card border border-border rounded-xl p-4 mb-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                <Input
                  placeholder="Search customer, phone, product, order #…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-1">
                {[
                  { v: '', label: 'All' },
                  { v: 'standalone', label: 'Direct' },
                  { v: 'job_card', label: 'Job Card' },
                ].map(({ v, label }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setTypeFilter(v)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${typeFilter === v
                      ? 'bg-accent text-white'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-bg-hover border border-transparent'
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {(search || typeFilter) && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{filtered.length} of {feed.length} records</span>
                <button
                  type="button"
                  onClick={() => { setSearch(''); setTypeFilter(''); }}
                  className="text-xs text-gray-400 hover:text-gray-200 underline"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* ── Sales table ── */}
          {filtered.length === 0 ? (
            <div className="bg-bg-card border border-border rounded-xl py-12 text-center text-gray-500 text-sm">
              {feed.length === 0 ? 'No sales recorded yet. Click "New Sale" to start.' : 'No records match the current filter.'}
            </div>
          ) : (
            <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Source</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Items</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Total</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const isExpanded = expandedRow === `${r.type}-${r.id}`;
                    return [
                      <tr
                        key={`${r.type}-${r.id}`}
                        className="border-b border-border hover:bg-bg-hover transition-colors cursor-pointer"
                        onClick={() => setExpandedRow(isExpanded ? null : `${r.type}-${r.id}`)}
                      >
                        <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{fmtD(r.date)}</td>
                        <td className="px-4 py-3">
                          <div className="text-gray-100 font-medium">{r.customer_name || '—'}</div>
                          {r.phone_number && <div className="text-xs text-gray-500">{r.phone_number}</div>}
                          {r.vehicle_number && <div className="text-xs text-sky-400">{r.vehicle_number}</div>}
                        </td>
                        <td className="px-4 py-3">
                          {r.type === 'standalone' ? (
                            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-900/40 text-blue-300 border border-blue-800">
                              Direct
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-violet-900/40 text-violet-300 border border-violet-800">
                              {r.order_number}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-gray-300 text-xs max-w-[200px]">
                            {(r.items || []).slice(0, 2).map((it, i) => (
                              <div key={i} className="truncate">{it.product_name} × {it.quantity}</div>
                            ))}
                            {(r.items || []).length > 2 && (
                              <div className="text-gray-500">+{r.items.length - 2} more</div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-gray-100">{fmt(r.total_amount)}</span>
                          {r.payment_method && (
                            <div className="text-xs text-gray-500">{METHOD_LABEL[r.payment_method] || r.payment_method}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={e => { e.stopPropagation(); downloadSalesInvoice(r); }}
                              className="p-1.5 text-gray-500 hover:text-blue-400 transition-colors"
                              title="Download invoice"
                            >
                              <Download size={14} />
                            </button>
                            {r.type === 'standalone' && r.phone_number && (
                              <button
                                onClick={e => { e.stopPropagation(); openWhatsAppForSale(r, toast); }}
                                className="p-1.5 text-gray-500 hover:text-green-400 transition-colors"
                                title="Send WhatsApp invoice"
                              >
                                <WaIcon />
                              </button>
                            )}
                            {r.type === 'standalone' && (
                              <button
                                onClick={e => { e.stopPropagation(); setConfirmDel({ id: r.id, order_number: r.order_number }); }}
                                className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                                title="Delete sale"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                            <button className="text-gray-500 p-1">
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                          </div>
                        </td>
                      </tr>,
                      isExpanded && (
                        <tr key={`${r.type}-${r.id}-expanded`} className="border-b border-border bg-bg-elev/40">
                          <td colSpan={6} className="px-6 py-3">
                            <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Items</div>
                            <div className="space-y-1">
                              {(r.items || []).map((it, i) => (
                                <div key={i} className="flex items-center justify-between text-xs text-gray-300 py-0.5">
                                  <span>
                                    <span className="font-medium text-gray-200">{it.product_name}</span>
                                    {it.brand ? <span className="text-gray-500 ml-1">{it.brand}</span> : null}
                                    <span className="text-gray-500 ml-1">· {it.unit_amount} {it.unit}</span>
                                    <span className="text-gray-500 ml-2">× {it.quantity}</span>
                                  </span>
                                  <span className="text-sky-400 font-semibold">{fmt(it.line_total)}</span>
                                </div>
                              ))}
                            </div>
                            {r.notes && (
                              <div className="mt-2 text-xs text-gray-500">Notes: {r.notes}</div>
                            )}
                          </td>
                        </tr>
                      ),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <NewSaleModal
        open={newSaleOpen}
        onClose={() => setNewSaleOpen(false)}
        onSaved={load}
      />

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={onDeleteConfirmed}
        title={`Delete sale ${confirmDel?.order_number}?`}
        message="This will permanently delete the sale and restore all items back to inventory."
        confirmText="Delete"
      />
    </div>
  );
}

// ─── New Sale Modal ───────────────────────────────────────────────────────────
function NewSaleModal({ open, onClose, onSaved }) {
  const toast = useToast();

  // Customer state
  const [phone, setPhone] = useState('');
  const [looking, setLooking] = useState(false);
  const [customerId, setCustomerId] = useState(null);
  const [customerName, setCustomerName] = useState('');
  const [customerFound, setCustomerFound] = useState(null); // true | false | null

  // Items state
  const [inventory, setInventory] = useState([]);
  const [invLoading, setInvLoading] = useState(false);
  const [invSearch, setInvSearch] = useState('');
  const [quantities, setQuantities] = useState({});
  const [prices, setPrices] = useState({});

  // Sale state
  const [saleDate, setSaleDate] = useState(localToday());
  const [payMethod, setPayMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhone(''); setLooking(false); setCustomerId(null); setCustomerName('');
    setCustomerFound(null); setInvSearch(''); setQuantities({}); setPrices({});
    setSaleDate(localToday()); setPayMethod('cash'); setNotes('');
    setInvLoading(true);
    listSalesInventory()
      .then(data => setInventory(Array.isArray(data) ? data : []))
      .catch(err => toast.error(extractError(err)))
      .finally(() => setInvLoading(false));
    // eslint-disable-next-line
  }, [open]);

  const handleLookup = async () => {
    if (!phone.trim()) return;
    setLooking(true);
    try {
      const res = await lookupCustomer(phone.trim());
      if (res.exists) {
        setCustomerId(res.customer.id);
        setCustomerName(res.customer.customer_name);
        setCustomerFound(true);
      } else {
        setCustomerId(null);
        setCustomerName('');
        setCustomerFound(false);
      }
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLooking(false);
    }
  };

  const UNIT_LABEL = { l: 'L', ml: 'ml', pcs: 'pcs', kg: 'kg', g: 'g', box: 'Box', set: 'Set' };

  const filteredInv = useMemo(() => {
    if (!invSearch.trim()) return inventory;
    const q = invSearch.toLowerCase();
    return inventory.filter(i =>
      i.product_name.toLowerCase().includes(q) ||
      (i.brand || '').toLowerCase().includes(q) ||
      (i.product_type || '').toLowerCase().includes(q)
    );
  }, [inventory, invSearch]);

  const selectedItems = inventory.filter(i => quantities[i.id] && Number(quantities[i.id]) > 0);

  const grandTotal = selectedItems.reduce((sum, i) => {
    const price = Number(prices[i.id] !== undefined ? prices[i.id] : (i.selling_price || 0));
    return sum + price * Number(quantities[i.id] || 0);
  }, 0);

  const submit = async () => {
    if (!customerName.trim()) { toast.error('Enter customer name'); return; }
    if (selectedItems.length === 0) { toast.error('Add at least one item'); return; }
    setSubmitting(true);
    try {
      const order = await createSalesOrder({
        customer_id: customerId,
        customer_name: customerName.trim(),
        phone_number: phone.trim(),
        sale_date: saleDate,
        payment_method: payMethod,
        notes: notes.trim(),
        items: selectedItems.map(i => ({
          inventory_id: i.id,
          quantity: Number(quantities[i.id]),
          unit_price: Number(prices[i.id] !== undefined ? prices[i.id] : (i.selling_price || 0)),
        })),
        total_amount: grandTotal,
      });
      toast.success(`Sale ${order.order_number} created`);
      // Build a feed-compatible record for immediate invoice download
      const feedRecord = {
        type: 'standalone',
        id: order.id,
        order_number: order.order_number,
        date: order.sale_date,
        customer_name: order.customer_name,
        phone_number: order.phone_number,
        vehicle_number: null,
        payment_method: order.payment_method,
        notes: order.notes,
        items: (order.items || []).map(it => ({
          product_name: it.product_name,
          brand: it.brand,
          quantity: it.quantity,
          unit_price: it.unit_price,
          unit: it.unit,
          unit_amount: it.unit_amount,
          line_total: it.line_total,
        })),
        total_amount: order.total_amount,
      };
      downloadSalesInvoice(feedRecord);
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
      open={open}
      onClose={onClose}
      title="New Sale"
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={submitting} disabled={selectedItems.length === 0 || !customerName.trim()}>
            Confirm Sale &amp; Download Bill
          </Button>
        </>
      }
    >
      <div className="space-y-5">

        {/* ── Customer lookup ── */}
        <div className="bg-bg-elev border border-border rounded-xl p-4 space-y-3">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Customer</div>
          <div className="flex gap-2">
            <Input
              placeholder="Enter phone number…"
              value={phone}
              onChange={e => { setPhone(e.target.value); setCustomerFound(null); }}
              onKeyDown={e => e.key === 'Enter' && handleLookup()}
              className="flex-1"
            />
            <Button variant="secondary" onClick={handleLookup} loading={looking} disabled={!phone.trim()}>
              Lookup
            </Button>
          </div>

          {customerFound === true && (
            <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-900/20 border border-emerald-700/40 rounded-lg px-3 py-2">
              <span>✓ Found: <strong>{customerName}</strong></span>
              <button onClick={() => { setCustomerFound(null); setCustomerId(null); setCustomerName(''); }} className="ml-auto text-gray-400 hover:text-gray-200"><X size={13} /></button>
            </div>
          )}
          {customerFound === false && (
            <div className="space-y-2">
              <div className="text-xs text-amber-400">New customer — enter name:</div>
              <Input
                placeholder="Customer name"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* ── Sale metadata ── */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sale Date" required>
            <Input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} />
          </Field>
          <Field label="Payment Method">
            <Select value={payMethod} onChange={e => setPayMethod(e.target.value)}>
              {[['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card'], ['netbanking', 'Net Banking'], ['cheque', 'Cheque'], ['other', 'Other']].map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
        </div>
        {payMethod === 'upi' && <UpiQr amount={grandTotal} />}

        {/* ── Product selection ── */}
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Select Products</div>
          <div className="relative mb-2">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <Input
              placeholder="Search products…"
              value={invSearch}
              onChange={e => setInvSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          {invLoading ? (
            <Loading />
          ) : filteredInv.length === 0 ? (
            <div className="text-xs text-gray-500 text-center py-4">
              {inventory.length === 0 ? 'No sales products in inventory.' : 'No items match search.'}
            </div>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {filteredInv.map(item => {
                const outOfStock = item.quantity_available <= 0;
                const qty = quantities[item.id] || '';
                const price = prices[item.id] !== undefined ? prices[item.id] : (item.selling_price || '');
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${outOfStock ? 'border-border opacity-40' : 'border-border hover:border-accent/30'
                      }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-200 truncate">{item.product_name}</div>
                      <div className="text-xs text-gray-500 flex gap-2">
                        {item.brand && <span>{item.brand}</span>}
                        <span>{item.unit_amount} {UNIT_LABEL[item.unit_label] || item.unit_label}</span>
                        <span className={outOfStock ? 'text-red-400' : 'text-emerald-400'}>
                          {outOfStock ? 'Out of stock' : `${item.quantity_available} in stock`}
                        </span>
                      </div>
                    </div>
                    {!outOfStock && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Input
                          type="number" step="0.01" min="0.01" placeholder="Qty"
                          value={qty}
                          onChange={e => setQuantities(q => ({ ...q, [item.id]: e.target.value }))}
                          className="w-20 text-xs"
                        />
                        <Input
                          type="number" step="0.01" min="0" placeholder="₹ Price"
                          value={price}
                          onChange={e => setPrices(p => ({ ...p, [item.id]: e.target.value }))}
                          className="w-24 text-xs"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Selected items summary ── */}
        {selectedItems.length > 0 && (
          <div className="bg-bg-elev border border-border rounded-xl p-4 space-y-2">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Summary ({selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''})
            </div>
            {selectedItems.map(i => {
              const p = Number(prices[i.id] !== undefined ? prices[i.id] : (i.selling_price || 0));
              const q = Number(quantities[i.id] || 0);
              return (
                <div key={i.id} className="flex justify-between text-xs text-gray-300">
                  <span>{i.product_name}{i.brand ? ` · ${i.brand}` : ''} × {q}</span>
                  <span className="text-sky-400 font-semibold">{fmt(p * q)}</span>
                </div>
              );
            })}
            <div className="flex justify-between text-sm font-bold border-t border-border pt-2">
              <span className="text-gray-100">Total</span>
              <span className="text-emerald-400">{fmt(grandTotal)}</span>
            </div>
          </div>
        )}

        <Field label="Notes">
          <Input placeholder="Optional notes…" value={notes} onChange={e => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
