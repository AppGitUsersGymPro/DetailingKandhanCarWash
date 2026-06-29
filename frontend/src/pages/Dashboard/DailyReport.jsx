import { useState, useEffect } from 'react';
import {
  Download, Calendar, TrendingUp, Car, AlertCircle,
  Wallet, CreditCard, Banknote, ArrowUpCircle, ArrowDownCircle,
  CheckCircle2, Clock, Package,
} from 'lucide-react';
import { styledXlsxDownload } from '../../utils/export';
import {
  ResponsiveContainer,
  PieChart, Pie, Cell, Tooltip as RechartsTip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import { getDailyReport } from '../../api/finance';
import Loading from '../../components/Loading';
import { useToast } from '../../components/Toast';
import { extractError } from '../../api/axios';

/* ─── helpers ──────────────────────────────────────────────────────────────── */
const fmt = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const todayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

const PAYMENT_LABEL = {
  cash: 'Cash', upi: 'UPI', card: 'Card',
  netbanking: 'Net Banking', cheque: 'Cheque', other: 'Other',
};
const PAYMENT_COLOR = {
  cash: '#10b981', upi: '#6366f1', card: '#f59e0b',
  netbanking: '#06b6d4', cheque: '#8b5cf6', other: '#94a3b8',
};
const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#06b6d4', '#8b5cf6', '#f43f5e', '#94a3b8'];

/* ─── SummaryCard ───────────────────────────────────────────────────────────── */
function SummaryCard({ label, value, icon: Icon, sub, accent = 'indigo' }) {
  const cfg = {
    indigo: { bg: 'bg-indigo-500/10',  border: 'border-indigo-500/25', text: 'text-indigo-400' },
    green:  { bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', text: 'text-emerald-400' },
    red:    { bg: 'bg-red-500/10',     border: 'border-red-500/25',    text: 'text-red-400' },
    amber:  { bg: 'bg-amber-500/10',   border: 'border-amber-500/25',  text: 'text-amber-400' },
  }[accent] || {};
  return (
    <div className={`rounded-xl border p-3 sm:p-4 overflow-hidden ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-center gap-2 mb-2 min-w-0">
        <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-bg-elev flex items-center justify-center shrink-0 ${cfg.text}`}>
          <Icon size={13} />
        </div>
        <span className="text-[11px] sm:text-xs text-gray-400 truncate">{label}</span>
      </div>
      <div className="text-base sm:text-lg font-bold text-gray-100 break-all leading-tight">{value}</div>
      {sub && <div className="text-[10px] sm:text-[11px] text-gray-500 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

/* ─── HTML Report generator ─────────────────────────────────────────────────── */
function generateHTML(r) {
  const fmtN = (n) =>
    `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const payRows = r.payment_breakdown.map(p => `
    <tr>
      <td>${PAYMENT_LABEL[p.method] || p.method}</td>
      <td style="text-align:right">${fmtN(p.amount)}</td>
      <td style="text-align:center">${p.count}</td>
    </tr>`).join('');

  const svcRows = r.service_revenue.map(s => {
    const pct = Number(s.billed) > 0
      ? Math.round((Number(s.collected) / Number(s.billed)) * 100) : 0;
    const bar = `<div style="height:8px;background:#2a2a3a;border-radius:4px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:#10b981;border-radius:4px"></div></div>`;
    return `<tr>
      <td>${s.service_name}</td>
      <td style="text-align:center">${s.jobs}</td>
      <td style="text-align:right">${fmtN(s.billed)}</td>
      <td style="text-align:right;color:#10b981">${fmtN(s.collected)}</td>
      <td style="text-align:right;color:#f43f5e">${fmtN(s.outstanding)}</td>
      <td style="min-width:120px">${bar} <small style="color:#9ca3af">${pct}%</small></td>
    </tr>`;
  }).join('');

  const pendRows = r.pending_sales.map(p => `
    <tr>
      <td>${p.job_card_number}</td>
      <td>${p.customer}</td>
      <td>${p.vehicle}</td>
      <td style="text-align:right">${fmtN(p.total)}</td>
      <td style="text-align:right;color:#10b981">${fmtN(p.paid)}</td>
      <td style="text-align:right;color:#f59e0b">${fmtN(p.outstanding)}</td>
    </tr>`).join('');

  const expRows = r.cash_expenses.items.map(e => `
    <tr>
      <td>${e.description}</td>
      <td><span class="badge">${e.category}</span></td>
      <td style="text-align:right;color:#f43f5e">${fmtN(e.amount)}</td>
    </tr>`).join('');

  // Simple donut chart as SVG
  const total = r.payment_breakdown.reduce((s, p) => s + Number(p.amount), 0);
  let cumulative = 0;
  const pieSegments = r.payment_breakdown.map((p, i) => {
    const pct  = total > 0 ? Number(p.amount) / total : 0;
    const start = cumulative;
    cumulative += pct;
    const startAngle = start * 2 * Math.PI - Math.PI / 2;
    const endAngle   = cumulative * 2 * Math.PI - Math.PI / 2;
    const r2 = 70;
    const x1 = 80 + r2 * Math.cos(startAngle);
    const y1 = 80 + r2 * Math.sin(startAngle);
    const x2 = 80 + r2 * Math.cos(endAngle);
    const y2 = 80 + r2 * Math.sin(endAngle);
    const large = pct > 0.5 ? 1 : 0;
    const color = PIE_COLORS[i % PIE_COLORS.length];
    if (pct === 0) return '';
    return `<path d="M80,80 L${x1.toFixed(1)},${y1.toFixed(1)} A${r2},${r2} 0 ${large},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z"
      fill="${color}" stroke="#13161d" stroke-width="2"/>`;
  }).join('');

  const pieLabels = r.payment_breakdown.map((p, i) => `
    <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#9ca3af">
      <span style="width:10px;height:10px;border-radius:2px;background:${PIE_COLORS[i % PIE_COLORS.length]};flex-shrink:0"></span>
      ${PAYMENT_LABEL[p.method] || p.method}: ${fmtN(p.amount)}
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Daily Closing Report – ${r.date}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #0b0d12; color: #e5e7eb; padding: 32px; }
  .page { max-width: 1000px; margin: 0 auto; }
  h1 { font-size: 22px; font-weight: 700; color: #fff; }
  h2 { font-size: 13px; font-weight: 600; color: #c4b5fd; text-transform: uppercase; letter-spacing: .06em; margin: 0 0 12px; }
  .header { background: linear-gradient(135deg, #1a1e27, #13161d); border: 1px solid #252a36; border-radius: 12px; padding: 24px 28px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
  .header .meta { font-size: 12px; color: #9ca3af; margin-top: 4px; }
  .stamp { text-align: right; font-size: 11px; color: #6b7280; }
  .stamp .date { font-size: 20px; font-weight: 700; color: #7c5cff; }
  .section { background: #13161d; border: 1px solid #252a36; border-radius: 12px; padding: 20px 24px; margin-bottom: 20px; }
  .grid4 { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin-bottom: 20px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
  .kpi { background: #1a1e27; border: 1px solid #252a36; border-radius: 10px; padding: 16px; }
  .kpi .lbl { font-size: 11px; color: #9ca3af; margin-bottom: 6px; text-transform: uppercase; letter-spacing: .05em; }
  .kpi .val { font-size: 20px; font-weight: 700; color: #fff; }
  .kpi.green .val { color: #10b981; }
  .kpi.red .val   { color: #f43f5e; }
  .kpi.amber .val { color: #f59e0b; }
  .kpi.purple .val { color: #c4b5fd; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; padding: 8px 10px; color: #9ca3af; font-weight: 500; border-bottom: 1px solid #252a36; }
  td { padding: 8px 10px; border-bottom: 1px solid #1a1e27; }
  tr:hover td { background: #1a1e27; }
  .badge { display: inline-block; padding: 2px 8px; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); border-radius: 20px; font-size: 10px; color: #818cf8; }
  .cf-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #252a36; font-size: 13px; }
  .cf-row:last-child { border-bottom: none; font-size: 16px; font-weight: 700; }
  .cf-total { font-size: 22px; font-weight: 800; color: #10b981; }
  .no-data { text-align: center; color: #6b7280; padding: 24px; font-size: 13px; }
  @media print { body { background: #fff; color: #111; } .section,.kpi,.header { background: #fff; border-color: #e5e7eb; } h2 { color: #4f46e5; } }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <h1>🚗 Detailing CRM</h1>
      <p class="meta">Daily Closing Report · Generated on ${new Date().toLocaleString('en-IN')}</p>
    </div>
    <div class="stamp">
      <div class="date">${r.date}</div>
      <div style="color:#9ca3af;font-size:11px;margin-top:4px">${r.summary.vehicles_serviced} vehicles serviced</div>
    </div>
  </div>

  <!-- KPI Row -->
  <div class="grid4">
    <div class="kpi purple"><div class="lbl">Total Billed</div><div class="val">${fmtN(r.summary.total_billed)}</div></div>
    <div class="kpi green"><div class="lbl">Total Collected</div><div class="val">${fmtN(r.summary.total_collected)}</div></div>
    <div class="kpi red"><div class="lbl">Outstanding</div><div class="val">${fmtN(r.summary.outstanding)}</div></div>
    <div class="kpi amber"><div class="lbl">Vehicles Serviced</div><div class="val">${r.summary.vehicles_serviced}</div></div>
  </div>

  <!-- Payment + Cash Flow -->
  <div class="grid2">
    <!-- Payment Breakdown -->
    <div class="section">
      <h2>Payment Mode Breakdown</h2>
      ${r.payment_breakdown.length === 0
        ? '<p class="no-data">No payments recorded today</p>'
        : `<div style="display:flex;align-items:flex-start;gap:20px">
            <svg width="160" height="160" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r="42" fill="#1a1e27"/>
              ${pieSegments}
            </svg>
            <div style="flex:1;padding-top:8px;display:flex;flex-direction:column;gap:6px">${pieLabels}</div>
          </div>
          <table style="margin-top:14px">
            <thead><tr><th>Method</th><th style="text-align:right">Amount</th><th style="text-align:center">Txns</th></tr></thead>
            <tbody>${payRows}</tbody>
          </table>`
      }
    </div>

    <!-- Flow Statement -->
    <div class="section">
      <h2>Flow Statement</h2>
      <div class="cf-row"><span style="color:#9ca3af">Opening Balance</span><span>${fmtN(r.cash_flow.opening_balance)}</span></div>
      <div class="cf-row"><span style="color:#10b981">＋ Collected Today (All Modes)</span><span style="color:#10b981">${fmtN(r.cash_flow.cash_collected)}</span></div>
      <div class="cf-row"><span style="color:#f43f5e">− Expenses Paid Out</span><span style="color:#f43f5e">${fmtN(r.cash_flow.cash_expenses)}</span></div>
      <div class="cf-row"><span>Closing Balance</span><span class="cf-total">${fmtN(r.cash_flow.closing_balance)}</span></div>
    </div>
  </div>

  <!-- Service Revenue -->
  <div class="section">
    <h2>Service Revenue Breakdown &amp; Variance</h2>
    ${r.service_revenue.length === 0
      ? '<p class="no-data">No services billed today</p>'
      : (() => {
          const maxBilled = Math.max(...r.service_revenue.map(s => Number(s.billed)), 1);
          const barH = 12;
          const gap  = 6;
          const rowH = barH * 3 + gap * 4 + 20; // 3 bars + gaps + label
          const chartH = r.service_revenue.length * rowH + 20;
          const labelW = 160;
          const chartW = 700;
          const barMaxW = chartW - labelW - 20;

          const rows = r.service_revenue.map((s, idx) => {
            const y0 = idx * rowH + 20;
            const bW  = Math.max(1, (Number(s.billed)      / maxBilled) * barMaxW);
            const cW  = Math.max(1, (Number(s.collected)   / maxBilled) * barMaxW);
            const oW  = Math.max(1, (Number(s.outstanding) / maxBilled) * barMaxW);
            const name = s.service_name.length > 20 ? s.service_name.slice(0,18) + '…' : s.service_name;
            return `
              <text x="${labelW - 8}" y="${y0 + barH / 2 + 4}" text-anchor="end" fill="#9ca3af" font-size="11">${name}</text>
              <rect x="${labelW}" y="${y0}"               width="${bW.toFixed(1)}" height="${barH}" rx="3" fill="#6366f1"/>
              <rect x="${labelW}" y="${y0 + barH + gap}"  width="${cW.toFixed(1)}" height="${barH}" rx="3" fill="#10b981"/>
              <rect x="${labelW}" y="${y0 + (barH+gap)*2}" width="${oW.toFixed(1)}" height="${barH}" rx="3" fill="#f43f5e"/>
              <text x="${labelW + bW + 4}" y="${y0 + barH/2 + 4}" fill="#c4b5fd" font-size="9">${fmtN(s.billed)}</text>
            `;
          }).join('');

          return `
            <svg width="${chartW}" height="${chartH}" style="display:block;overflow:visible;margin-bottom:16px">
              <!-- Legend -->
              <rect x="${labelW}" y="2" width="10" height="10" rx="2" fill="#6366f1"/>
              <text x="${labelW + 14}" y="11" fill="#9ca3af" font-size="10">Billed</text>
              <rect x="${labelW + 70}" y="2" width="10" height="10" rx="2" fill="#10b981"/>
              <text x="${labelW + 84}" y="11" fill="#9ca3af" font-size="10">Collected</text>
              <rect x="${labelW + 160}" y="2" width="10" height="10" rx="2" fill="#f43f5e"/>
              <text x="${labelW + 174}" y="11" fill="#9ca3af" font-size="10">Outstanding</text>
              ${rows}
            </svg>
            <table>
              <thead><tr>
                <th>Service</th><th style="text-align:center">Jobs</th>
                <th style="text-align:right">Billed</th>
                <th style="text-align:right">Collected</th>
                <th style="text-align:right">Outstanding</th>
                <th>Collection %</th>
              </tr></thead>
              <tbody>${svcRows}</tbody>
            </table>`;
        })()
    }
  </div>

  <!-- Inventory Products Used -->
  ${(r.product_usage || []).length > 0 ? (() => {
    const UNIT = { l:'L', ml:'ml', kg:'kg', g:'g', pcs:'pcs', pair:'pair', set:'set', m:'m', ft:'ft' };
    const maxQty = Number(r.product_usage[0].total_qty);
    const fmtN = n => n % 1 === 0 ? String(n) : n.toFixed(2);
    const prodRows = r.product_usage.map((p, i) => {
      const qty   = Number(p.total_qty);
      const ua    = Number(p.unit_amount);
      const total = qty * ua;
      const pct   = maxQty > 0 ? Math.round((qty / maxQty) * 100) : 0;
      const uLabel = UNIT[p.unit] || p.unit;
      const medals = ['🥇', '🥈', '🥉'];
      return `<tr>
        <td style="width:28px;text-align:center;color:#6b7280;font-family:monospace">${medals[i] || (i + 1)}</td>
        <td>
          <div style="font-weight:500;color:#e5e7eb">${p.product_name}</div>
          ${p.brand ? `<div style="font-size:10px;color:#6b7280">${p.brand}</div>` : ''}
        </td>
        <td style="width:200px">
          <div style="height:8px;background:#1a1e27;border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:#06b6d4;border-radius:4px"></div>
          </div>
        </td>
        <td style="text-align:right;white-space:nowrap">
          <div style="color:#67e8f9;font-weight:600">${fmtN(qty)} × ${fmtN(ua)} ${uLabel}</div>
          <div style="color:#22d3ee;font-size:10px">= ${fmtN(total)} ${uLabel}</div>
        </td>
      </tr>`;
    }).join('');
    return `<div class="section">
      <h2 style="color:#06b6d4">📦 Inventory Products Consumed (${r.product_usage.length})</h2>
      <table>
        <thead><tr>
          <th style="width:28px">#</th>
          <th>Product</th>
          <th>Usage</th>
          <th style="text-align:right">Qty</th>
        </tr></thead>
        <tbody>${prodRows}</tbody>
      </table>
    </div>`;
  })() : ''}

  <!-- Pending Sales -->
  ${r.pending_sales.length > 0 ? `
  <div class="section" style="border-color:rgba(245,158,11,0.3)">
    <h2 style="color:#f59e0b">⚠ Pending / Credit Sales (${r.pending_sales.length})</h2>
    <table>
      <thead><tr>
        <th>Job Card</th><th>Customer</th><th>Vehicle</th>
        <th style="text-align:right">Total</th>
        <th style="text-align:right">Paid</th>
        <th style="text-align:right">Outstanding</th>
      </tr></thead>
      <tbody>${pendRows}</tbody>
    </table>
  </div>` : ''}

  <!-- Cash Expenses -->
  ${r.cash_expenses.items.length > 0 ? `
  <div class="section">
    <h2>Cash Expenses Paid Out — ${fmtN(r.cash_expenses.total)}</h2>
    <table>
      <thead><tr><th>Description</th><th>Category</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${expRows}</tbody>
    </table>
  </div>` : ''}

  <!-- Footer -->
  <div style="text-align:center;color:#374151;font-size:11px;margin-top:24px;padding-top:16px;border-top:1px solid #1a1e27">
    Generated by Detailing CRM · ${r.date} · Confidential
  </div>

</div>
</body>
</html>`;
}

/* ─── Excel export ──────────────────────────────────────────────────────────── */
async function exportExcel(r) {
  const m   = (n) => Number(Number(n || 0).toFixed(2));
  const gen = `Generated: ${new Date().toLocaleDateString('en-IN')}`;

  const payData  = r.payment_breakdown.map(p => [PAYMENT_LABEL[p.method] || p.method, m(p.amount), p.count]);
  const svcData  = r.service_revenue.map(s => {
    const pct = Number(s.billed) > 0 ? Math.round((Number(s.collected) / Number(s.billed)) * 100) : 0;
    return [s.service_name, s.jobs, m(s.billed), m(s.collected), m(s.outstanding), `${pct}%`];
  });
  const pendData = r.pending_sales.map(p => [p.job_card_number, p.customer, p.vehicle, p.services, m(p.total), m(p.paid), m(p.outstanding)]);
  const expData  = r.cash_expenses.items.map(e => [e.description, e.category, m(e.amount)]);

  await styledXlsxDownload(`daily-report-${r.date}.xlsx`, [
    {
      name: 'Summary',
      title: `Daily Closing Report — ${r.date}`,
      subtitle: gen,
      headers: ['Metric', 'Value'],
      rows: [
        ['Total Billed (₹)',    m(r.summary.total_billed)],
        ['Total Collected (₹)', m(r.summary.total_collected)],
        ['Outstanding (₹)',     m(r.summary.outstanding)],
        ['Vehicles Serviced',   r.summary.vehicles_serviced],
      ],
      colWidths: [26, 18],
    },
    {
      name: 'Payment Breakdown',
      title: 'Payment Mode Breakdown',
      subtitle: gen,
      headers: ['Payment Method', 'Amount (₹)', 'Transactions'],
      rows: payData,
      totals: ['TOTAL', payData.reduce((s, d) => s + d[1], 0), payData.reduce((s, d) => s + d[2], 0)],
      colWidths: [22, 16, 14],
    },
    {
      name: 'Service Revenue',
      title: 'Service Revenue Breakdown',
      subtitle: gen,
      headers: ['Service', 'Jobs', 'Billed (₹)', 'Collected (₹)', 'Outstanding (₹)', 'Collection %'],
      rows: svcData,
      totals: ['TOTAL',
        svcData.reduce((s, d) => s + d[1], 0),
        svcData.reduce((s, d) => s + d[2], 0),
        svcData.reduce((s, d) => s + d[3], 0),
        svcData.reduce((s, d) => s + d[4], 0),
        '',
      ],
      colWidths: [28, 8, 16, 16, 16, 14],
    },
    {
      name: 'Pending Sales',
      title: 'Pending / Credit Sales',
      subtitle: gen,
      headers: ['Job Card #', 'Customer', 'Vehicle', 'Services', 'Total (₹)', 'Paid (₹)', 'Outstanding (₹)'],
      rows: pendData,
      totals: pendData.length ? ['TOTAL', '', '', '',
        pendData.reduce((s, d) => s + d[4], 0),
        pendData.reduce((s, d) => s + d[5], 0),
        pendData.reduce((s, d) => s + d[6], 0),
      ] : undefined,
      colWidths: [14, 22, 16, 30, 14, 14, 16],
    },
    {
      name: 'Cash Flow',
      title: 'Cash Flow Statement',
      subtitle: gen,
      headers: ['Item', 'Amount (₹)'],
      rows: [
        ['Opening Balance',       m(r.cash_flow.opening_balance)],
        ['(+) Collected Today',   m(r.cash_flow.cash_collected)],
        ['(-) Expenses Paid Out', m(r.cash_flow.cash_expenses)],
        ['Closing Balance',       m(r.cash_flow.closing_balance)],
      ],
      colWidths: [26, 18],
    },
    {
      name: 'Cash Expenses',
      title: 'Cash Expenses',
      subtitle: gen,
      headers: ['Description', 'Category', 'Amount (₹)'],
      rows: expData,
      totals: expData.length ? ['TOTAL', '', expData.reduce((s, d) => s + d[2], 0)] : undefined,
      colWidths: [34, 18, 14],
    },
  ]);
}

/* ─── Main component ────────────────────────────────────────────────────────── */
export default function DailyReport() {
  const toast   = useToast();
  const [date, setDate]     = useState(todayStr);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!date) return;          // guard: ignore empty date strings
    let cancelled = false;
    setReport(null);            // clear stale data immediately so old date's numbers never linger
    setLoading(true);
    getDailyReport(date)
      .then(d => { if (!cancelled) setReport(d); })
      .catch(err => { if (!cancelled) toast.error(extractError(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const handleHTMLDownload = () => {
    if (!report) return;
    const blob = new Blob([generateHTML(report)], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `daily-report-${report.date}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
            <Calendar size={16} className="text-violet-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-100">Daily Closing Report</h2>
            <p className="text-[11px] text-gray-500">End-of-day snapshot — all figures for selected date</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="bg-bg-elev border border-border rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleHTMLDownload}
            disabled={!report || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-elev border border-border rounded-lg text-xs text-gray-300 hover:text-gray-100 hover:bg-bg-hover disabled:opacity-40 transition"
          >
            <Download size={12} /> HTML
          </button>
          <button
            onClick={() => report && exportExcel(report)}
            disabled={!report || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/30 border border-emerald-700/40 rounded-lg text-xs text-emerald-300 hover:bg-emerald-900/50 disabled:opacity-40 transition"
          >
            <Download size={12} /> Excel
          </button>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="py-12"><Loading /></div>
      ) : !report ? null : (
        <div className="p-3 sm:p-5 space-y-4 sm:space-y-5">

          {/* Date confirmation banner */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
            <Calendar size={13} className="text-violet-400 shrink-0" />
            <span className="text-xs text-violet-300 font-medium">
              Showing report for&nbsp;
              <span className="font-bold text-violet-200">
                {new Date(report.date + 'T00:00:00').toLocaleDateString('en-IN', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                })}
              </span>
            </span>
          </div>

          {/* ── 1. Summary KPI Row ───────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard
              label="Total Billed"
              value={fmt(report.summary.total_billed)}
              icon={TrendingUp}
              accent="indigo"
            />
            <SummaryCard
              label="Total Collected"
              value={fmt(report.summary.total_collected)}
              icon={Wallet}
              accent="green"
              sub={`${report.summary.total_billed > 0
                ? Math.round((Number(report.summary.total_collected) / Number(report.summary.total_billed)) * 100)
                : 0}% of billed`}
            />
            <SummaryCard
              label="Outstanding"
              value={fmt(report.summary.outstanding)}
              icon={AlertCircle}
              accent="red"
            />
            <SummaryCard
              label="Vehicles Serviced"
              value={report.summary.vehicles_serviced}
              icon={Car}
              accent="amber"
            />
          </div>

          {/* ── 2 & 7. Payment Breakdown + Cash Flow ─────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* 2. Payment Mode Breakdown */}
            <div className="bg-bg rounded-xl border border-border p-4">
              <h3 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
                <CreditCard size={14} className="text-accent" />
                Payment Mode Breakdown
              </h3>
              {report.payment_breakdown.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">No payments recorded today</p>
              ) : (
                <div className="flex flex-col sm:flex-row items-start gap-4">
                  {/* Donut — fixed size, amounts coerced to Number so Recharts can compute proportions */}
                  <div className="shrink-0 mx-auto sm:mx-0">
                    <PieChart width={130} height={130}>
                      <Pie
                        data={report.payment_breakdown.map(p => ({ ...p, amount: Number(p.amount) }))}
                        dataKey="amount"
                        nameKey="method"
                        cx="50%"
                        cy="50%"
                        innerRadius={38}
                        outerRadius={58}
                        strokeWidth={2}
                        stroke="#13161d"
                      >
                        {report.payment_breakdown.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTip
                        contentStyle={{ background: '#1a1e27', border: '1px solid #252a36', borderRadius: 8, fontSize: 11 }}
                        formatter={(v, n) => [fmt(v), PAYMENT_LABEL[n] || n]}
                      />
                    </PieChart>
                  </div>
                  {/* Bars */}
                  <div className="flex-1 space-y-2.5 w-full">
                    {report.payment_breakdown.map((pm, i) => {
                      const max = Math.max(...report.payment_breakdown.map(p => Number(p.amount)));
                      const pct = max > 0 ? (Number(pm.amount) / max) * 100 : 0;
                      const clr = PIE_COLORS[i % PIE_COLORS.length];
                      return (
                        <div key={pm.method}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-gray-300 flex items-center gap-1.5">
                              <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: clr }} />
                              {PAYMENT_LABEL[pm.method] || pm.method}
                            </span>
                            <span className="text-gray-100 font-medium">
                              {fmt(pm.amount)}&nbsp;
                              <span className="text-gray-500">({pm.count} txn)</span>
                            </span>
                          </div>
                          <div className="h-1.5 bg-bg-elev rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: clr }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 7. Flow Statement */}
            <div className="bg-bg rounded-xl border border-border p-4">
              <h3 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
                <Banknote size={14} className="text-emerald-400" />
                Flow Statement
              </h3>
              <div className="space-y-0">
                {[
                  {
                    label: 'Opening Balance',
                    value: report.cash_flow.opening_balance,
                    icon: Clock,
                    cls: 'text-gray-300',
                  },
                  {
                    label: 'Collected Today (All Modes)',
                    value: report.cash_flow.cash_collected,
                    icon: ArrowUpCircle,
                    cls: 'text-emerald-400',
                    prefix: '+',
                  },
                  {
                    label: 'Expenses Paid Out',
                    value: report.cash_flow.cash_expenses,
                    icon: ArrowDownCircle,
                    cls: 'text-red-400',
                    prefix: '−',
                  },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between gap-3 py-3 border-b border-border">
                    <div className="flex items-center gap-2 text-xs text-gray-400 min-w-0">
                      <row.icon size={14} className={`${row.cls} shrink-0`} />
                      <span className="truncate">{row.label}</span>
                    </div>
                    <span className={`text-sm font-semibold shrink-0 ${row.cls}`}>
                      {row.prefix}{fmt(row.value)}
                    </span>
                  </div>
                ))}
                {/* Closing */}
                <div className="flex items-center justify-between gap-3 pt-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-100 shrink-0">
                    <CheckCircle2 size={15} className={Number(report.cash_flow.closing_balance) >= 0 ? 'text-emerald-400' : 'text-red-400'} />
                    Closing Balance
                  </div>
                  <span className={`text-lg sm:text-2xl font-bold break-all text-right ${Number(report.cash_flow.closing_balance) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {fmt(report.cash_flow.closing_balance)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── 3. Service Revenue + Variance ──────────────────── */}
          <div className="bg-bg rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
              <TrendingUp size={14} className="text-indigo-400" />
              Service Revenue &amp; Collection Variance
            </h3>
            {report.service_revenue.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">No services billed today</p>
            ) : (
              <>
              {/* Bar chart — billed vs collected per service */}
              <div className="mb-5">
                <ResponsiveContainer width="100%" height={Math.max(160, report.service_revenue.length * 44)}>
                  <BarChart
                    data={report.service_revenue.map(s => ({
                      name: s.service_name.length > 18 ? s.service_name.slice(0, 16) + '…' : s.service_name,
                      fullName: s.service_name,
                      Billed: Number(s.billed),
                      Collected: Number(s.collected),
                      Outstanding: Number(s.outstanding),
                    }))}
                    layout="vertical"
                    margin={{ top: 4, right: 20, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#252a36" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: '#6b7280', fontSize: 10 }}
                      tickFormatter={(v) => `₹${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fill: '#9ca3af', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={110}
                    />
                    <RechartsTip
                      contentStyle={{ background: '#1a1e27', border: '1px solid #252a36', borderRadius: 8, fontSize: 11 }}
                      formatter={(value, name, props) => [fmt(value), name]}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11, color: '#9ca3af', paddingTop: 8 }}
                    />
                    <Bar dataKey="Billed"      fill="#6366f1" radius={[0, 3, 3, 0]} maxBarSize={14} />
                    <Bar dataKey="Collected"   fill="#10b981" radius={[0, 3, 3, 0]} maxBarSize={14} />
                    <Bar dataKey="Outstanding" fill="#f43f5e" radius={[0, 3, 3, 0]} maxBarSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      {['Service', 'Jobs', 'Billed', 'Collected', 'Outstanding', 'Collection Rate'].map(h => (
                        <th key={h} className="pb-2.5 pr-5 text-left text-gray-400 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.service_revenue.map(s => {
                      const billedN = Number(s.billed);
                      const colN    = Number(s.collected);
                      const pct     = billedN > 0 ? Math.round((colN / billedN) * 100) : 0;
                      const clr     = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500';
                      const txtClr  = pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400';
                      return (
                        <tr key={s.service_name} className="hover:bg-bg-hover transition-colors">
                          <td className="py-2.5 pr-5 text-gray-200 font-medium">{s.service_name}</td>
                          <td className="py-2.5 pr-5 text-gray-400">{s.jobs}</td>
                          <td className="py-2.5 pr-5 text-gray-100 font-semibold">{fmt(s.billed)}</td>
                          <td className="py-2.5 pr-5 text-emerald-400 font-semibold">{fmt(s.collected)}</td>
                          <td className="py-2.5 pr-5 text-red-400">{fmt(s.outstanding)}</td>
                          <td className="py-2.5 pr-5">
                            <div className="flex items-center gap-2 min-w-[100px]">
                              <div className="flex-1 h-2 bg-bg-elev rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${clr}`} style={{ width: `${pct}%` }} />
                              </div>
                              <span className={`text-[10px] font-bold ${txtClr} w-7 text-right`}>{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Totals row */}
                  <tfoot>
                    <tr className="border-t-2 border-border bg-bg-elev/50">
                      <td className="py-2.5 pr-5 text-gray-200 font-semibold">TOTAL</td>
                      <td className="py-2.5 pr-5 text-gray-300 font-semibold">
                        {report.service_revenue.reduce((s, r) => s + r.jobs, 0)}
                      </td>
                      <td className="py-2.5 pr-5 text-gray-100 font-bold">{fmt(report.summary.total_billed)}</td>
                      <td className="py-2.5 pr-5 text-emerald-400 font-bold">{fmt(report.summary.total_collected)}</td>
                      <td className="py-2.5 pr-5 text-red-400 font-bold">{fmt(report.summary.outstanding)}</td>
                      <td className="py-2.5 pr-5 text-gray-400 text-[10px]">
                        {Number(report.summary.total_billed) > 0
                          ? Math.round((Number(report.summary.total_collected) / Number(report.summary.total_billed)) * 100)
                          : 0}% overall
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              </>
            )}
          </div>

          {/* ── 4. Inventory Products Used ──────────────────────── */}
          <div className="bg-bg rounded-xl border border-border p-4">
              <h3 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
                <Package size={14} className="text-cyan-400" />
                Inventory Products Consumed
                <span className="ml-auto text-xs text-gray-500 font-normal">
                  Top {report.product_usage.length} most consumed today
                </span>
              </h3>

              {(report.product_usage || []).length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">No product usage recorded for this date</p>
              ) : (<>
              {/* Top-3 highlight chips */}
              <div className="flex flex-wrap gap-2 mb-4">
                {report.product_usage.slice(0, 3).map((p, i) => {
                  const UNIT   = { l:'L', ml:'ml', kg:'kg', g:'g', pcs:'pcs', pair:'pair', set:'set', m:'m', ft:'ft' };
                  const qty    = Number(p.total_qty);
                  const ua     = Number(p.unit_amount);
                  const total  = qty * ua;
                  const fmtN   = n => n % 1 === 0 ? String(n) : n.toFixed(2);
                  const uLabel = UNIT[p.unit] || p.unit;
                  const colors = [
                    'border-amber-600/40 bg-amber-900/20 text-amber-300',
                    'border-gray-600/40  bg-gray-800/40  text-gray-300',
                    'border-orange-700/40 bg-orange-900/20 text-orange-300',
                  ];
                  const medals = ['🥇', '🥈', '🥉'];
                  return (
                    <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium ${colors[i]}`}>
                      <span>{medals[i]}</span>
                      <span>{p.product_name}{p.brand ? ` · ${p.brand}` : ''}</span>
                      <span className="opacity-60">—</span>
                      <span>{fmtN(qty)} × {fmtN(ua)} {uLabel} = {fmtN(total)} {uLabel}</span>
                    </div>
                  );
                })}
              </div>

              {/* Horizontal bar rows */}
              <div className="space-y-2.5">
                {report.product_usage.map((p, i) => {
                  const UNIT    = { l:'L', ml:'ml', kg:'kg', g:'g', pcs:'pcs', pair:'pair', set:'set', m:'m', ft:'ft' };
                  const maxQty  = Number(report.product_usage[0].total_qty);
                  const qty     = Number(p.total_qty);
                  const ua      = parseFloat(p.unit_amount) || 1;
                  const total   = qty * ua;
                  const pct     = maxQty > 0 ? (qty / maxQty) * 100 : 0;
                  const fmtN    = n => n % 1 === 0 ? String(n) : n.toFixed(2);
                  const unitLabel = UNIT[p.unit] || p.unit;
                  return (
                    <div key={i} className="flex items-center gap-2 sm:gap-3">
                      {/* Rank */}
                      <div className="w-4 sm:w-5 text-center text-[11px] text-gray-600 font-mono shrink-0">{i + 1}</div>
                      {/* Name + brand */}
                      <div className="w-24 sm:w-40 shrink-0 min-w-0">
                        <div className="text-xs font-medium text-gray-200 truncate">{p.product_name}</div>
                        {p.brand && <div className="text-[10px] text-gray-500 truncate">{p.brand}</div>}
                      </div>
                      {/* Bar */}
                      <div className="flex-1 h-4 bg-bg-elev rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-cyan-500/60" style={{ width: `${pct}%` }} />
                      </div>
                      {/* qty × unit_amount unit */}
                      <div className="w-24 sm:w-32 text-right text-xs shrink-0">
                        <span className="font-semibold text-cyan-300">{fmtN(qty)}</span>
                        <span className="text-gray-500 mx-0.5">×</span>
                        <span className="text-gray-400">{fmtN(ua)}</span>
                        <span className="text-gray-500 ml-0.5">{unitLabel}</span>
                        <div className="text-[10px] text-cyan-500/70">= {fmtN(total)} {unitLabel}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>)}
          </div>

          {/* ── 5. Pending / Credit Sales ───────────────────────── */}
          {report.pending_sales.length > 0 && (
            <div className="bg-bg rounded-xl border border-amber-700/30 p-4">
              <h3 className="text-sm font-semibold text-amber-300 mb-3 flex items-center gap-2">
                <AlertCircle size={14} />
                Pending / Credit Sales — {report.pending_sales.length} job card{report.pending_sales.length !== 1 ? 's' : ''}
                <span className="ml-auto text-xs font-medium text-amber-400">
                  Total outstanding: {fmt(report.pending_sales.reduce((s, p) => s + Number(p.outstanding), 0))}
                </span>
              </h3>
              <div className="divide-y divide-border">
                {report.pending_sales.map(ps => (
                  <div key={ps.job_card_number} className="flex items-center justify-between py-2.5 gap-4">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-gray-200">
                        {ps.job_card_number}
                        <span className="text-gray-400 font-normal"> · {ps.customer}</span>
                      </div>
                      <div className="text-[10px] text-gray-500 truncate">{ps.vehicle} · {ps.services}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold text-amber-300">{fmt(ps.outstanding)} due</div>
                      <div className="text-[10px] text-gray-500">{fmt(ps.paid)} paid of {fmt(ps.total)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 6. Cash Expenses ────────────────────────────────── */}
          {report.cash_expenses.items.length > 0 && (
            <div className="bg-bg rounded-xl border border-border p-4">
              <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
                <ArrowDownCircle size={14} className="text-red-400" />
                Cash Expenses Paid Out
                <span className="ml-auto text-sm font-bold text-red-400">{fmt(report.cash_expenses.total)}</span>
              </h3>
              <div className="divide-y divide-border">
                {report.cash_expenses.items.map((e, i) => (
                  <div key={i} className="flex items-center justify-between py-2 gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 rounded text-[9px] border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 shrink-0">
                        {e.category}
                      </span>
                      <span className="text-xs text-gray-300 truncate">{e.description}</span>
                    </div>
                    <span className="text-xs font-semibold text-red-400 shrink-0">{fmt(e.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {report.summary.vehicles_serviced === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Car size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No job cards found for {report.date}.</p>
              <p className="text-xs mt-1">Select a different date or create job cards for this day.</p>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
