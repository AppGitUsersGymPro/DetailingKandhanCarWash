import { useEffect, useState } from 'react';
import {
  IndianRupee, TrendingUp, TrendingDown, Wallet,
  AlertCircle, Download, Search, ChevronDown,
} from 'lucide-react';
import { styledXlsxDownload } from '../../utils/export';
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Cell,
} from 'recharts';
import PageHeader from '../../components/PageHeader';
import Loading from '../../components/Loading';
import { useToast } from '../../components/Toast';
import { getFinanceDashboard, getFinanceIncome, getFinanceExpense, createExpense } from '../../api/finance';
import { extractError } from '../../api/axios';



const fmt = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const todayMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const CHART_COLORS = { income: '#6366f1', expense: '#f43f5e', savings: '#10b981' };
const BAR_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e'];

const EXPENSE_CATS = [
  { value: '', label: 'All Categories' },
  { value: 'salary', label: 'Salary' },
  { value: 'advance', label: 'Advance' },
  { value: 'vendor_invoice', label: 'Vendor Invoice' },
  { value: 'others', label: 'Others' },
];


const STATUS_CLS = {
  paid: 'bg-emerald-900/30 text-emerald-300 border-emerald-700',
  partial: 'bg-yellow-900/30 text-yellow-300 border-yellow-700',
  unpaid: 'bg-red-900/30 text-red-300 border-red-700',
};

function MetricBox({ label, value, accent = 'indigo', loading }) {
  const bg = {
    indigo: 'border-indigo-500/30 bg-indigo-500/5',
    green: 'border-emerald-500/30 bg-emerald-500/5',
    yellow: 'border-yellow-500/30 bg-yellow-500/5',
  }[accent] || 'border-indigo-500/30 bg-indigo-500/5';
  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <p className="text-xs text-gray-400 mb-1 truncate">{label}</p>
      {loading
        ? <div className="h-6 w-24 bg-bg-elev rounded animate-pulse" />
        : <p className="text-lg font-semibold text-gray-100 leading-tight">{value}</p>}
    </div>
  );
}

function SideBox({ label, value, icon: Icon, accent = 'indigo', loading }) {
  const clr = { indigo: 'text-indigo-400', green: 'text-emerald-400', rose: 'text-rose-400', yellow: 'text-yellow-400' }[accent] || 'text-indigo-400';
  return (
    <div className="bg-bg-card border border-border rounded-xl p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg bg-bg-elev flex items-center justify-center shrink-0 ${clr}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 truncate">{label}</p>
        {loading
          ? <div className="h-5 w-20 bg-bg-elev rounded animate-pulse mt-1" />
          : <p className="text-base font-semibold text-gray-100 truncate">{value}</p>}
      </div>
    </div>
  );
}

async function exportExcel(rows, cols, filename, title) {
  const dataRows = rows.map(r => cols.map(c => {
    const v = r[c.key];
    const n = Number(v);
    return (v !== '' && v !== null && v !== undefined && !isNaN(n) && typeof v !== 'boolean') ? n : (v ?? '');
  }));
  const totalsRow = cols.map((_, ci) => {
    if (ci === 0) return 'TOTAL';
    const nums = dataRows.map(r => r[ci]).filter(v => typeof v === 'number');
    return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) : '';
  });

  await styledXlsxDownload(`${filename}.xlsx`, [{
    name: 'Report',
    title: title || filename,
    subtitle: `Generated: ${new Date().toLocaleDateString('en-IN')} · ${rows.length} record${rows.length !== 1 ? 's' : ''}`,
    headers: cols.map(c => c.label),
    rows: dataRows,
    totals: totalsRow,
    colWidths: cols.map(c => Math.max(c.label.length + 4, 14)),
  }]);
}

function CatBar({ title, data }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-200 mb-4">{title}</h3>
        <p className="text-sm text-gray-500 text-center py-6">No data for this month</p>
      </div>
    );
  }
  const total = data.reduce((s, d) => s + d.amount, 0);
  const chart = data.map(d => ({ ...d, pct: total > 0 ? Math.round((d.amount / total) * 100) : 0 }));
  return (
    <div className="bg-bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-200 mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chart} layout="vertical" margin={{ left: 8, right: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" horizontal={false} />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="category" tick={{ fill: '#9ca3af', fontSize: 11 }} width={100} />
          <Tooltip
            contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a3a', borderRadius: 8 }}
            formatter={(v, n, p) => [fmt(p.payload.amount), p.payload.category]}
            cursor={{ fill: '#ffffff08' }}
          />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
            {chart.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap gap-2">
        {chart.map((d, i) => (
          <span key={d.category} className="text-xs text-gray-400 flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: BAR_COLORS[i % BAR_COLORS.length] }} />
            {d.category}: {d.pct}%
          </span>
        ))}
      </div>
    </div>
  );
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1a2e] border border-[#2a2a3a] rounded-lg p-3 text-xs space-y-1">
      <p className="font-semibold text-gray-200 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name.charAt(0).toUpperCase() + p.name.slice(1)}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
}

export default function FinanceDashboard() {
  const toast = useToast();
  const [month, setMonth] = useState(todayMonth);

  const [dash, setDash] = useState(null);
  const [dashLoading, setDashLoading] = useState(true);

  const [income, setIncome] = useState([]);
  const [incomeLoading, setIncLoading] = useState(true);
  const [incomeSearch, setIncomeSearch] = useState('');
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [expense, setExpense] = useState([]);
  const [expLoading, setExpLoading] = useState(true);
  const [expSearch, setExpSearch] = useState('');
  const [expCat, setExpCat] = useState('');
  const [amount, setAmount] = useState(0);
  const [customer, setCustomer] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState('');
  const [reference, setReference] = useState('');
  // dash
  useEffect(() => {
    let cancelled = false;
    setDashLoading(true);
    getFinanceDashboard(month)
      .then(d => { if (!cancelled) setDash(d); })
      .catch(err => { if (!cancelled) toast.error(extractError(err)); })
      .finally(() => { if (!cancelled) setDashLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  // income
  useEffect(() => {
    let cancelled = false;
    setIncLoading(true);
    getFinanceIncome({ month, search: incomeSearch })
      .then(d => { if (!cancelled) setIncome(Array.isArray(d) ? d : []); })
      .catch(err => { if (!cancelled) toast.error(extractError(err)); })
      .finally(() => { if (!cancelled) setIncLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, incomeSearch]);

  // expense
  useEffect(() => {
    let cancelled = false;
    setExpLoading(true);
    getFinanceExpense({ month, search: expSearch, category: expCat })
      .then(d => { if (!cancelled) setExpense(Array.isArray(d) ? d : []); })
      .catch(err => { if (!cancelled) toast.error(extractError(err)); })
      .finally(() => { if (!cancelled) setExpLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, expSearch, expCat]);

  const tbc = dash?.to_be_collected || {};
  const col = dash?.collected || {};

  const incomeByCat = income.length
    ? [{ category: 'Job Card', amount: income.reduce((s, r) => s + Number(r.paid_amount || 0), 0) }]
    : [];

  const expenseByCat = expense.reduce((acc, r) => {
    const ex = acc.find(x => x.category === r.category);
    if (ex) ex.amount += Number(r.amount || 0);
    else acc.push({ category: r.category, amount: Number(r.amount || 0) });
    return acc;
  }, []);

  const handleSubmit = async () => {
    try {
      const t = await createExpense({ amount, customer, date, category, reference });
      toast.success("Expense Added Successfully");
      setShowAddExpenseModal(false);
      // Reset fields
      setAmount(0);
      setCustomer('');
      setDate('');
      setCategory('');
      setReference('');
      // Refresh expense list
      setExpSearch('');
    }
    catch (err) {
      toast.error(extractError(err));
    }
  }
  return (
    <div>
      <PageHeader
        title="Finance"
        subtitle="Income, expenses, and savings overview"
        actions={
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 shrink-0">Month</label>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="bg-bg-elev border border-border rounded-md px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-accent"
            />
          </div>
        }
      />

      {/* ── Top section ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">

        {/* Left: 2 groups of 3 */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-bg-card border border-border rounded-xl p-5">
            <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <AlertCircle size={12} /> To Be Collected
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <MetricBox label="Total to be Collected" value={fmt(tbc.total)} accent="yellow" loading={dashLoading} />
              <MetricBox label="Base (excl. GST)" value={fmt(tbc.base)} accent="yellow" loading={dashLoading} />
              <MetricBox label="GST Outstanding" value={fmt(tbc.gst)} accent="yellow" loading={dashLoading} />
            </div>
          </div>

          <div className="bg-bg-card border border-border rounded-xl p-5">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Wallet size={12} /> Collected
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <MetricBox label="Total Collected" value={fmt(col.total)} accent="green" loading={dashLoading} />
              <MetricBox label="Base Collected" value={fmt(col.base)} accent="green" loading={dashLoading} />
              <MetricBox label="GST Collected" value={fmt(col.gst)} accent="green" loading={dashLoading} />
            </div>
          </div>
        </div>

        {/* Right: 4 stacked */}
        <div className="flex flex-col gap-3">
          <SideBox label="Yearly Income (Billed)" value={fmt(dash?.yearly_income)} icon={TrendingUp} accent="indigo" loading={dashLoading} />
          <SideBox
            label="Net Savings (Month)"
            value={fmt(dash?.net_savings)}
            icon={IndianRupee}
            accent={Number(dash?.net_savings || 0) >= 0 ? 'green' : 'rose'}
            loading={dashLoading}
          />
          <SideBox label="Expense (Month)" value={fmt(dash?.expense_of_month)} icon={TrendingDown} accent="rose" loading={dashLoading} />
          <SideBox label="Outstanding (Month)" value={fmt(dash?.outstanding_of_month)} icon={AlertCircle} accent="yellow" loading={dashLoading} />
        </div>
      </div>

      {/* ── Chart ────────────────────────────────────────── */}
      <div className="bg-bg-card border border-border rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-200 mb-4">
          Income vs Expense vs Savings — {new Date().getFullYear()}
        </h2>
        {dashLoading ? (
          <div className="h-64 flex items-center justify-center"><Loading /></div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={dash?.monthly_chart || []} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
              <XAxis dataKey="month" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                tickFormatter={v => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
              />
              <Tooltip content={<ChartTip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} formatter={v => v.charAt(0).toUpperCase() + v.slice(1)} />
              <Bar dataKey="income" fill={CHART_COLORS.income} radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Bar dataKey="expense" fill={CHART_COLORS.expense} radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Line type="monotone" dataKey="savings" stroke={CHART_COLORS.savings} strokeWidth={2} dot={{ r: 3, fill: CHART_COLORS.savings }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Income & Expense Tables ───────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-6">
        {/* Income */}
        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-200 shrink-0">Income — {month}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  placeholder="Search..."
                  value={incomeSearch}
                  onChange={e => setIncomeSearch(e.target.value)}
                  className="pl-7 pr-3 py-1.5 bg-bg-elev border border-border rounded-md text-xs text-gray-200 focus:outline-none focus:border-accent w-28 sm:w-36"
                />
              </div>
              <button
                onClick={() => exportExcel(income, [
                  { key: 'date', label: 'Date' },
                  { key: 'job_card_number', label: 'Job Card' },
                  { key: 'customer_name', label: 'Customer' },
                  { key: 'vehicle_number', label: 'Vehicle' },
                  { key: 'services', label: 'Services' },
                  { key: 'total_amount', label: 'Total (₹)' },
                  { key: 'base_amount', label: 'Base (₹)' },
                  { key: 'gst_percent', label: 'GST %' },
                  { key: 'gst_amount', label: 'GST Amt (₹)' },
                  { key: 'paid_amount', label: 'Paid (₹)' },
                  { key: 'base_to_collect', label: 'Base To Collect (₹)' },
                  { key: 'gst_to_collect', label: 'GST To Collect (₹)' },
                  { key: 'outstanding', label: 'Outstanding (₹)' },
                  { key: 'payment_status', label: 'Status' },
                ], `income-${month}`, `Income Report — ${month}`)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-bg-elev border border-border rounded-md text-xs text-gray-300 hover:text-gray-100 hover:bg-bg-hover transition-colors"
              >
                <Download size={12} /> Excel
              </button>
            </div>
          </div>
          {incomeLoading ? <Loading /> : income.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No income records this month</p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-bg-card border-b border-border">
                    <tr>
                      {['Date', 'Job Card', 'Customer', 'Total', 'Base', 'GST%', 'GST Amt', 'Paid', 'Base To Collect', 'GST To Collect', 'Status'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-gray-400 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {income.map(r => (
                      <tr key={r.id} className="hover:bg-bg-hover transition-colors">
                        <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{r.date}</td>
                        <td className="px-3 py-2.5 text-gray-200 font-medium whitespace-nowrap">{r.job_card_number}</td>
                        <td className="px-3 py-2.5 text-gray-300 max-w-[120px] truncate">{r.customer_name}</td>
                        <td className="px-3 py-2.5 text-gray-100 font-medium whitespace-nowrap">{fmt(r.total_amount)}</td>
                        <td className="px-3 py-2.5 text-gray-300 whitespace-nowrap">{fmt(r.base_amount)}</td>
                        <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{r.gst_percent}%</td>
                        <td className="px-3 py-2.5 text-indigo-300 whitespace-nowrap">{fmt(r.gst_amount)}</td>
                        <td className="px-3 py-2.5 text-emerald-400 whitespace-nowrap">{fmt(r.paid_amount)}</td>
                        <td className="px-3 py-2.5 text-yellow-300 whitespace-nowrap">{fmt(r.base_to_collect)}</td>
                        <td className="px-3 py-2.5 text-yellow-300 whitespace-nowrap">{fmt(r.gst_to_collect)}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] border capitalize ${STATUS_CLS[r.payment_status] || ''}`}>
                            {r.payment_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile card list */}
              <div className="sm:hidden divide-y divide-border max-h-[400px] overflow-y-auto">
                {income.map(r => (
                  <div key={r.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-gray-200">{r.job_card_number}</span>
                        {r.vehicle_number && <span className="text-[10px] text-sky-400 ml-2">{r.vehicle_number}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] border capitalize ${STATUS_CLS[r.payment_status] || ''}`}>
                          {r.payment_status}
                        </span>
                        <span className="text-[10px] text-gray-500">{r.date}</span>
                      </div>
                    </div>
                    <div className="text-xs text-gray-300 truncate mb-2">{r.customer_name}</div>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <div className="text-[10px] text-gray-500 mb-0.5">Total</div>
                        <div className="font-semibold text-gray-100">{fmt(r.total_amount)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-500 mb-0.5">Paid</div>
                        <div className="font-semibold text-emerald-400">{fmt(r.paid_amount)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-500 mb-0.5">Outstanding</div>
                        <div className="font-semibold text-yellow-300">{fmt(r.outstanding)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Expense */}
        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-200 shrink-0">Expenses — {month}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  placeholder="Search..."
                  value={expSearch}
                  onChange={e => setExpSearch(e.target.value)}
                  className="pl-7 pr-3 py-1.5 bg-bg-elev border border-border rounded-md text-xs text-gray-200 focus:outline-none focus:border-accent w-28 sm:w-32"
                />
              </div>
              <div className="relative">
                <select
                  value={expCat}
                  onChange={e => setExpCat(e.target.value)}
                  className="appearance-none pl-2.5 pr-6 py-1.5 bg-bg-elev border border-border rounded-md text-xs text-gray-200 focus:outline-none focus:border-accent"
                >
                  {EXPENSE_CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              </div>
              <button
                onClick={() => exportExcel(expense, [
                  { key: 'date', label: 'Date' },
                  { key: 'description', label: 'Description' },
                  { key: 'category', label: 'Category' },
                  { key: 'amount', label: 'Amount (₹)' },
                  { key: 'reference', label: 'Reference' },
                ], `expense-${month}`, `Expense Report — ${month}`)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-bg-elev border border-border rounded-md text-xs text-gray-300 hover:text-gray-100 hover:bg-bg-hover transition-colors"
              >
                <Download size={12} /> Excel
              </button>
              <button onClick={() => setShowAddExpenseModal(true)} className="flex items-center gap-1 px-2.5 py-1.5 bg-accent/20 border border-accent/30 rounded-md text-xs text-accent hover:bg-accent/30 transition-colors whitespace-nowrap">
                Add Expense +
              </button>
            </div>
          </div>
          {showAddExpenseModal && (
            <AddExpenseModal
              onClose={() => setShowAddExpenseModal(false)}
              Amount={amount}
              Customer={customer}
              Date={date}
              Category={category}
              Reference={reference}
              setAmount={setAmount}
              setCustomer={setCustomer}
              setDate={setDate}
              setCategory={setCategory}
              setReference={setReference}
              onSubmit={handleSubmit}
            />
          )}
          {expLoading ? <Loading /> : expense.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No expense records this month</p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-bg-card border-b border-border">
                    <tr>
                      {['Date', 'Description', 'Category', 'Amount', 'Reference'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-gray-400 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {expense.map(r => (
                      <tr key={r.id} className="hover:bg-bg-hover transition-colors">
                        <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{r.date}</td>
                        <td className="px-3 py-2.5 text-gray-200 max-w-[180px] truncate">{r.description}</td>
                        <td className="px-3 py-2.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
                            {r.category}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-rose-400 font-medium whitespace-nowrap">{fmt(r.amount)}</td>
                        <td className="px-3 py-2.5 text-gray-500 truncate max-w-[120px]">{r.reference}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile card list */}
              <div className="sm:hidden divide-y divide-border max-h-[400px] overflow-y-auto">
                {expense.map(r => (
                  <div key={r.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="text-sm font-semibold text-rose-400">{fmt(r.amount)}</div>
                      <div className="text-[10px] text-gray-500 shrink-0">{r.date}</div>
                    </div>
                    <div className="text-xs text-gray-200 mb-1.5 truncate">{r.description || '—'}</div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 shrink-0">
                        {r.category}
                      </span>
                      {r.reference && <span className="text-[10px] text-gray-500 truncate">{r.reference}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Category charts ───────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <CatBar title="Income by Category" data={incomeByCat} />
        <CatBar title="Expense by Category" data={expenseByCat} />
      </div>
    </div>
  );
}

export function AddExpenseModal({ onClose, Amount, Customer, Date, Category, Reference, setAmount, setCustomer, setDate, setCategory, setReference, onSubmit }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-bg-card border border-border rounded-t-2xl sm:rounded-xl p-5 sm:p-6 w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-100">Add Expense</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 p-1">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-400 mb-1">Amount</p>
            <input
              type="number"
              placeholder="Enter amount"
              className="w-full bg-bg-elev border border-border rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-accent"
              value={Amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Description / Customer</p>
            <input
              type="text"
              placeholder="Enter description or customer name"
              className="w-full bg-bg-elev border border-border rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-accent"
              value={Customer}
              onChange={(e) => setCustomer(e.target.value)}
            />
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Date</p>
            <input
              type="date"
              className="w-full bg-bg-elev border border-border rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-accent"
              value={Date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Category</p>
            <select
              className="w-full bg-bg-elev border border-border rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-accent"
              value={Category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {EXPENSE_CATS.filter(c => c.value).map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Reference</p>
            <input
              type="text"
              placeholder="Enter reference"
              className="w-full bg-bg-elev border border-border rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-accent"
              value={Reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button className="flex-1 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors" onClick={onSubmit}>
            Record Expense
          </button>
          <button onClick={onClose} className="flex-1 py-2.5 bg-bg-elev border border-border text-gray-300 text-sm font-medium rounded-lg hover:bg-bg-hover transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

