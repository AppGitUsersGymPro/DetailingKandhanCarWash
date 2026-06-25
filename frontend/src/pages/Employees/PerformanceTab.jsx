import { useCallback, useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, Cell,
} from 'recharts';
import {
  ChevronLeft, ChevronRight, Download, TrendingUp,
  Target, IndianRupee, Award, Users,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { styledXlsxDownload } from '../../utils/export';
import PageHeader   from '../../components/PageHeader';
import Loading      from '../../components/Loading';
import EmptyState   from '../../components/EmptyState';
import Button       from '../../components/Button';
import { useToast } from '../../components/Toast';
import { getEmployeePerformance } from '../../api/employees';
import { extractError } from '../../api/axios';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const AVATAR_COLORS = [
  '#818cf8','#6366f1','#34d399','#10b981',
  '#fbbf24','#f59e0b','#f87171','#ef4444',
  '#38bdf8','#0ea5e9',
];

const fmt  = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const fmtK = (v) => v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`;

function initials(name) {
  return (name || '?').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

function ProgressBar({ pct, color }) {
  return (
    <div className="h-2 rounded-full bg-bg-elev overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ── Custom tooltip for recharts ───────────────────────────────────────────────
function ChartTooltip({ active, payload, label, isRevenue }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-card border border-border rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="text-gray-300 font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.fill }}>
          {isRevenue ? fmt(p.value) : p.value} {!isRevenue && 'orders'}
        </p>
      ))}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────
export default function PerformanceTab() {
  const now  = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear]   = useState(now.getFullYear());
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getEmployeePerformance({ month, year });
      setData(res);
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  }, [month, year]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  // ── Excel download ───────────────────────────────────────────────────────────
  const downloadExcel = async () => {
    if (!data?.employees?.length) return;
    const { employees, targets } = data;
    const periodLabel = `${MONTHS[month - 1]} ${year}`;
    const title = `Employee Performance — ${periodLabel}`;

    const headers = [
      'Employee', 'Code', 'Role',
      'Orders Completed', 'Order Target', 'Order %',
      'Revenue (₹)', 'Revenue Target (₹)', 'Revenue %',
      'Incentive Earned (₹)', 'Threshold Met',
    ];
    const dataRows = employees.map((e) => [
      e.employee_name,
      e.employee_code,
      e.role || '',
      e.service_count,
      targets.order_threshold,
      `${e.order_pct}%`,
      Number(e.revenue)              || 0,
      Number(targets.revenue_target) || 0,
      `${e.revenue_pct}%`,
      Number(e.incentive_earned)     || 0,
      e.threshold_met ? 'Yes' : 'No',
    ]);
    const totalsRow = [
      'TOTAL', '', '',
      dataRows.reduce((s, r) => s + r[3], 0), '', '',
      dataRows.reduce((s, r) => s + r[6], 0), '', '',
      dataRows.reduce((s, r) => s + r[9], 0), '',
    ];
    const incentiveDesc = targets.incentive_type === 'fixed'
      ? `Fixed Rs.${targets.incentive_fixed_amount} per order above threshold`
      : `${targets.incentive_salary_percent}% of salary`;

    await styledXlsxDownload(`performance-${MONTHS[month - 1]}-${year}.xlsx`, [{
      name: 'Performance',
      title,
      subtitle: `Order Target: ${targets.order_threshold} orders/emp · Revenue Target: Rs.${Number(targets.revenue_target).toLocaleString('en-IN')}/emp · Incentive: ${incentiveDesc}`,
      headers,
      rows: dataRows,
      totals: totalsRow,
      colWidths: [24, 12, 14, 18, 14, 10, 16, 20, 12, 20, 14],
    }]);
  };

  // ── PDF download ────────────────────────────────────────────────────────────
  const downloadPDF = () => {
    if (!data?.employees?.length) return;
    const { employees, targets } = data;
    const doc = new jsPDF({ orientation: 'landscape' });

    doc.setFontSize(16);
    doc.setTextColor(40);
    doc.text(`Employee Performance — ${MONTHS[month - 1]} ${year}`, 14, 16);

    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(
      `Order Target: ${targets.order_threshold} services/employee   |   Revenue Target: ${fmt(targets.revenue_target)}/employee   |   Incentive: ${targets.incentive_type === 'fixed' ? `₹${targets.incentive_fixed_amount}/order above threshold` : `${targets.incentive_salary_percent}% of salary`}`,
      14, 23,
    );

    autoTable(doc, {
      startY: 28,
      head: [['Employee', 'Code', 'Role', 'Orders', 'Order %', 'Revenue', 'Revenue %', 'Incentive', 'Met?']],
      body: employees.map((e) => [
        e.employee_name,
        e.employee_code,
        e.role || '—',
        `${e.service_count} / ${targets.order_threshold}`,
        `${e.order_pct}%`,
        fmt(e.revenue),
        Number(targets.revenue_target) > 0 ? `${e.revenue_pct}%` : '—',
        fmt(e.incentive_earned),
        e.threshold_met ? '✓ Yes' : '✗ No',
      ]),
      styles:         { fontSize: 9, cellPadding: 3 },
      headStyles:     { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 255] },
      columnStyles: {
        0: { cellWidth: 40 },
        4: { halign: 'center' },
        6: { halign: 'center' },
        8: { halign: 'center' },
      },
    });

    doc.save(`performance_${MONTHS[month - 1]}_${year}.pdf`);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) return <Loading />;
  if (!data)   return null;

  const { employees, targets } = data;
  const totalOrders    = employees.reduce((s, e) => s + e.service_count, 0);
  const totalRevenue   = employees.reduce((s, e) => s + Number(e.revenue), 0);
  const atThreshold    = employees.filter((e) => e.threshold_met).length;
  const totalIncentive = employees.reduce((s, e) => s + Number(e.incentive_earned), 0);

  const orderChartData = employees.map((e) => ({
    name:   e.employee_name.split(' ')[0],
    orders: e.service_count,
    met:    e.threshold_met,
  }));

  const revenueChartData = employees.map((e) => ({
    name:    e.employee_name.split(' ')[0],
    revenue: Number(e.revenue),
    met:     Number(e.revenue) >= Number(targets.revenue_target) && Number(targets.revenue_target) > 0,
  }));

  const hasRevenueTarget = Number(targets.revenue_target) > 0;

  return (
    <div className="space-y-5">

      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Performance Dashboard"
          subtitle="Monthly employee targets — orders vs threshold, revenue vs target"
        />
        <div className="flex items-center gap-2 flex-wrap">
          {/* Month navigator */}
          <div className="flex items-center gap-1 bg-bg-card border border-border rounded-xl px-2 py-1">
            <button onClick={prevMonth} className="p-1 text-gray-400 hover:text-gray-100 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-gray-100 w-32 text-center">
              {MONTHS[month - 1]} {year}
            </span>
            <button onClick={nextMonth} className="p-1 text-gray-400 hover:text-gray-100 transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
          <Button variant="secondary" onClick={downloadExcel} className="flex items-center gap-1.5">
            <Download size={14} /> Excel
          </Button>
          <Button variant="secondary" onClick={downloadPDF} className="flex items-center gap-1.5">
            <Download size={14} /> PDF
          </Button>
        </div>
      </div>

      {/* Target reminder */}
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="bg-indigo-900/20 border border-indigo-700/30 text-indigo-300 px-3 py-1.5 rounded-lg">
          Order target: <strong>{targets.order_threshold}</strong> services / employee
        </span>
        <span className="bg-emerald-900/20 border border-emerald-700/30 text-emerald-300 px-3 py-1.5 rounded-lg">
          Revenue target: <strong>{fmt(targets.revenue_target)}</strong> / employee
        </span>
        <span className="bg-purple-900/20 border border-purple-700/30 text-purple-300 px-3 py-1.5 rounded-lg">
          Incentive ({targets.incentive_type}):&nbsp;
          {targets.incentive_type === 'fixed'
            ? <strong>{fmt(targets.incentive_fixed_amount)} per order above threshold</strong>
            : <strong>{targets.incentive_salary_percent}% of salary if threshold met</strong>}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { icon: Target,      color: 'text-indigo-400 bg-indigo-900/30',  label: 'Total Orders',   value: totalOrders,         sub: `Target: ${targets.order_threshold}/employee` },
          { icon: IndianRupee, color: 'text-emerald-400 bg-emerald-900/30', label: 'Total Revenue',  value: fmt(totalRevenue),   sub: hasRevenueTarget ? `Target: ${fmt(targets.revenue_target)}/emp` : 'No revenue target set' },
          { icon: Award,       color: 'text-teal-400 bg-teal-900/30',      label: 'At Threshold',   value: `${atThreshold} / ${employees.length}`, sub: 'employees earned incentive' },
          { icon: TrendingUp,  color: 'text-purple-400 bg-purple-900/30',  label: 'Total Incentive', value: fmt(totalIncentive), sub: `${targets.incentive_type} type` },
        ].map(({ icon: Icon, color, label, value, sub }) => (
          <div key={label} className="bg-bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
              <Icon size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-gray-500 mb-1">{label}</div>
              <div className="text-xl font-bold text-gray-100 leading-none mb-1">{value}</div>
              <div className="text-xs text-gray-500 truncate">{sub}</div>
            </div>
          </div>
        ))}
      </div>

      {employees.length === 0 ? (
        <EmptyState icon={Users} title="No active employees" message="No active employees found for this period." />
      ) : (
        <>
          {/* Charts */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

            {/* Orders chart */}
            <div className="bg-bg-card border border-border rounded-2xl p-5">
              <p className="text-sm font-semibold text-gray-200 mb-4">Orders vs Target</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={orderChartData} barSize={32} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip isRevenue={false} />} cursor={{ fill: '#ffffff06' }} />
                  <ReferenceLine
                    y={targets.order_threshold}
                    stroke="#818cf8"
                    strokeDasharray="5 3"
                    strokeOpacity={0.7}
                    label={{ value: `Target ${targets.order_threshold}`, fill: '#818cf8', fontSize: 10, position: 'insideTopRight' }}
                  />
                  <Bar dataKey="orders" radius={[5, 5, 0, 0]}>
                    {orderChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.met ? '#10b981' : '#6366f1'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block bg-emerald-500" />
                  At / above target
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block bg-indigo-500" />
                  Below target
                </span>
              </div>
            </div>

            {/* Revenue chart */}
            <div className="bg-bg-card border border-border rounded-2xl p-5">
              <p className="text-sm font-semibold text-gray-200 mb-4">Revenue vs Target</p>
              {!hasRevenueTarget ? (
                <div className="h-[220px] flex flex-col items-center justify-center gap-2 text-center px-6">
                  <IndianRupee size={28} className="text-gray-600" />
                  <p className="text-xs text-gray-500">
                    No revenue target set.<br />
                    Go to <strong className="text-gray-400">Settings → Staff &amp; Incentive → Monthly Revenue Target</strong> to configure it.
                  </p>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={revenueChartData} barSize={32} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                      <Tooltip content={<ChartTooltip isRevenue />} cursor={{ fill: '#ffffff06' }} />
                      <ReferenceLine
                        y={Number(targets.revenue_target)}
                        stroke="#34d399"
                        strokeDasharray="5 3"
                        strokeOpacity={0.7}
                        label={{ value: `Target ${fmtK(Number(targets.revenue_target))}`, fill: '#34d399', fontSize: 10, position: 'insideTopRight' }}
                      />
                      <Bar dataKey="revenue" radius={[5, 5, 0, 0]}>
                        {revenueChartData.map((entry, i) => (
                          <Cell key={i} fill={entry.met ? '#10b981' : '#8b5cf6'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block bg-emerald-500" />
                      At / above target
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block bg-violet-500" />
                      Below target
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Per-employee breakdown */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">
              Individual Breakdown
            </p>
            {employees.map((emp, i) => (
              <EmployeeCard
                key={emp.employee_id}
                emp={emp}
                targets={targets}
                color={AVATAR_COLORS[i % AVATAR_COLORS.length]}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Employee card ─────────────────────────────────────────────────────────────

function EmployeeCard({ emp, targets, color }) {
  const hasRevenueTarget = Number(targets.revenue_target) > 0;
  const orderPct  = Math.min(emp.order_pct, 100);
  const revPct    = Math.min(emp.revenue_pct, 100);
  const incEarned = Number(emp.incentive_earned);

  return (
    <div className="bg-bg-card border border-border rounded-2xl p-5 transition-colors hover:border-border/70">

      {/* Row 1 — identity + badge */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
            style={{ background: color + '28', color }}
          >
            {initials(emp.employee_name)}
          </div>
          <div>
            <div className="font-semibold text-gray-100">{emp.employee_name}</div>
            <div className="text-xs text-gray-500">
              {emp.employee_code}
              {emp.role ? ` · ${emp.role}` : ''}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {emp.threshold_met ? (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-900/30 text-emerald-400 border border-emerald-700/30">
              Incentive Earned
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-800 text-gray-500 border border-border">
              Below Threshold
            </span>
          )}
          {incEarned > 0 && (
            <span className="text-sm font-bold text-teal-400">+{fmt(incEarned)}</span>
          )}
        </div>
      </div>

      {/* Row 2 — progress bars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

        {/* Orders */}
        <div>
          <div className="flex justify-between text-xs mb-2">
            <span className="text-gray-400 font-medium">Orders Completed</span>
            <span className="text-gray-200 font-semibold">
              {emp.service_count}
              <span className="text-gray-500 font-normal"> / {targets.order_threshold}</span>
              <span
                className={`ml-2 text-xs ${emp.threshold_met ? 'text-emerald-400' : 'text-gray-600'}`}
              >
                {emp.order_pct}%
              </span>
            </span>
          </div>
          <ProgressBar pct={orderPct} color={emp.threshold_met ? '#10b981' : '#6366f1'} />
          {emp.orders_above_threshold > 0 && (
            <p className="text-xs text-emerald-500 mt-1.5">
              +{emp.orders_above_threshold} above threshold
            </p>
          )}
        </div>

        {/* Revenue */}
        <div>
          <div className="flex justify-between text-xs mb-2">
            <span className="text-gray-400 font-medium">Revenue Generated</span>
            <span className="text-gray-200 font-semibold">
              {fmt(emp.revenue)}
              {hasRevenueTarget && (
                <span
                  className={`ml-2 text-xs ${emp.revenue_pct >= 100 ? 'text-emerald-400' : 'text-gray-600'}`}
                >
                  {emp.revenue_pct}%
                </span>
              )}
            </span>
          </div>
          {hasRevenueTarget ? (
            <ProgressBar pct={revPct} color={emp.revenue_pct >= 100 ? '#10b981' : '#8b5cf6'} />
          ) : (
            <div className="h-2 rounded-full bg-bg-elev">
              <div className="h-full rounded-full bg-violet-500/20 w-full" />
            </div>
          )}
          {hasRevenueTarget && (
            <p className="text-xs text-gray-600 mt-1.5">
              of {fmt(targets.revenue_target)} target
            </p>
          )}
        </div>
      </div>

      {/* Row 3 — incentive breakdown */}
      {emp.threshold_met && (
        <div className="mt-4 pt-3 border-t border-border text-xs text-gray-500">
          {targets.incentive_type === 'fixed' ? (
            <>
              {emp.orders_above_threshold} orders above threshold
              {' × '}
              {fmt(targets.incentive_fixed_amount)}/order
              {' = '}
              <span className="text-teal-400 font-semibold">{fmt(incEarned)}</span>
            </>
          ) : (
            <>
              Threshold met ({emp.service_count} orders)
              {' — '}
              {targets.incentive_salary_percent}% of ₹{Number(emp.base_salary).toLocaleString('en-IN')} salary
              {' = '}
              <span className="text-teal-400 font-semibold">{fmt(incEarned)}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
