const fmt = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (s) => {
  if (!s) return '—';
  return new Date(s.length <= 10 ? s + 'T00:00:00' : s).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const fmtDateTime = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const METHOD = {
  cash: 'Cash', upi: 'UPI', card: 'Card',
  netbanking: 'Net Banking', cheque: 'Cheque', other: 'Other',
};

export function buildInvoiceHTML(jobCard) {
  const services      = jobCard.job_card_services || [];
  const salesProducts = jobCard.sales_products    || [];
  const payments      = jobCard.payments          || [];
  const total         = Number(jobCard.total_amount         || 0);
  const servicesTotal = Number(jobCard.services_total       || jobCard.total_amount || 0);
  const salesTotal    = Number(jobCard.sales_products_total || 0);
  const paid          = Number(jobCard.paid_amount  || 0);
  const outstanding   = Number(jobCard.outstanding  || 0);
  const payStatus     = jobCard.payment_status || 'unpaid';

  const statusColor = payStatus === 'paid' ? '#10b981' : payStatus === 'partial' ? '#f59e0b' : '#f43f5e';
  const statusBg    = payStatus === 'paid' ? '#052e16'  : payStatus === 'partial' ? '#2d1a07'  : '#2d0a0a';
  const statusLabel = payStatus === 'paid' ? '✓ FULLY PAID' : payStatus === 'partial' ? '⚡ PARTIALLY PAID' : '✗ UNPAID';

  const genDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const serviceRows = services.map((s) => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #1f2431">${s.service_name || '—'}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #1f2431;text-align:center;color:#9ca3af;font-size:11px;text-transform:capitalize">${(s.service_status || 'pending').replace('_', ' ')}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #1f2431;text-align:right;font-weight:600;color:#c4b5fd">${fmt(s.price_at_time)}</td>
    </tr>`).join('');

  const UNIT_LABEL = { l: 'L', ml: 'ml', pcs: 'pcs', kg: 'kg', g: 'g', box: 'Box', set: 'Set' };
  const salesProductRows = salesProducts.map((sp) => {
    const unitStr = `${sp.unit_amount} ${UNIT_LABEL[sp.unit] || sp.unit || ''}`.trim();
    const desc = [sp.brand, unitStr].filter(Boolean).join(' · ');
    return `<tr>
      <td style="padding:10px 14px;border-bottom:1px solid #1f2431">
        ${sp.product_name || '—'}
        ${desc ? `<div style="font-size:11px;color:#6b7280;margin-top:2px">${desc}</div>` : ''}
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #1f2431;text-align:center;color:#9ca3af;font-size:12px">${sp.quantity}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #1f2431;text-align:right;color:#9ca3af;font-size:12px">${fmt(sp.unit_price)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #1f2431;text-align:right;font-weight:600;color:#38bdf8">${fmt(sp.line_total)}</td>
    </tr>`;
  }).join('');

  const paymentRows = payments.map((p, i) => `
    <tr>
      <td style="padding:8px 14px;border-bottom:1px solid #1f2431;color:#9ca3af;text-align:center;font-size:11px">${i + 1}</td>
      <td style="padding:8px 14px;border-bottom:1px solid #1f2431;color:#e5e7eb">${fmtDate(p.payment_date)}</td>
      <td style="padding:8px 14px;border-bottom:1px solid #1f2431;color:#9ca3af">${METHOD[p.payment_method] || p.payment_method}</td>
      <td style="padding:8px 14px;border-bottom:1px solid #1f2431;text-align:right;color:#34d399;font-weight:700">${fmt(p.amount)}</td>
      <td style="padding:8px 14px;border-bottom:1px solid #1f2431;color:#6b7280;font-size:11px">${p.notes || '—'}</td>
    </tr>`).join('');

  const makeModel = [jobCard.vehicle_company, jobCard.vehicle_model].filter(Boolean).join(' · ');
  const timeRow = [
    jobCard.vehicle_entry_time ? `<div><div class="lbl">Entry Time</div><div class="val s">${fmtDateTime(jobCard.vehicle_entry_time)}</div></div>` : '',
    jobCard.vehicle_exit_time  ? `<div><div class="lbl">Exit Time</div><div class="val s">${fmtDateTime(jobCard.vehicle_exit_time)}</div></div>` : '',
    jobCard.employee_name      ? `<div><div class="lbl">Employee</div><div class="val">${jobCard.employee_name}</div></div>` : '',
  ].filter(Boolean).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Invoice — ${jobCard.job_card_number || jobCard.id}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#0b0d12;color:#e5e7eb;padding:32px}
.page{max-width:820px;margin:0 auto}
.card{background:#13161d;border:1px solid #252a36;border-radius:12px;padding:22px 26px;margin-bottom:16px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:16px;padding-top:16px;border-top:1px solid #1f2431}
.lbl{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px}
.val{font-size:13px;color:#e5e7eb;font-weight:500}.val.s{font-size:12px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{padding:9px 14px;color:#6b7280;font-weight:500;text-align:left;border-bottom:1px solid #252a36;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
.chip{display:inline-block;padding:5px 14px;border-radius:20px;font-size:11px;font-weight:700}
.sec{font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px}
.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1f2431}
@media print{body{background:#fff;color:#111}.card{background:#fff;border-color:#e5e7eb}}
</style>
</head>
<body>
<div class="page">

<div class="card" style="background:linear-gradient(135deg,#1a1e27,#0f1117);margin-bottom:20px">
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-.3px">🚗 Detailing Workshop</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px">Service Invoice</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:16px;color:#a78bfa;font-weight:800">${jobCard.job_card_number || '—'}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:3px">Date: ${fmtDate(jobCard.job_card_date)}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:2px">Generated: ${genDate}</div>
      <div style="margin-top:10px">
        <span class="chip" style="background:${statusBg};color:${statusColor};border:1px solid ${statusColor}55">${statusLabel}</span>
      </div>
    </div>
  </div>
</div>

<div class="card">
  <div class="grid2">
    <div>
      <div class="sec">Customer</div>
      <div style="margin-bottom:10px"><div class="lbl">Name</div><div class="val">${jobCard.customer_name || '—'}</div></div>
      <div><div class="lbl">Phone</div><div class="val">${jobCard.phone_number || '—'}</div></div>
    </div>
    <div>
      <div class="sec">Vehicle</div>
      <div style="margin-bottom:10px"><div class="lbl">Vehicle Number</div><div class="val" style="color:#38bdf8;font-weight:700">${jobCard.vehicle_number || '—'}</div></div>
      ${makeModel   ? `<div style="margin-bottom:10px"><div class="lbl">Make / Model</div><div class="val">${makeModel}</div></div>` : ''}
      ${jobCard.vehicle_colour     ? `<div style="margin-bottom:10px"><div class="lbl">Colour</div><div class="val">${jobCard.vehicle_colour}</div></div>` : ''}
      ${jobCard.vehicle_kilometers ? `<div><div class="lbl">KM Reading</div><div class="val">${Number(jobCard.vehicle_kilometers).toLocaleString('en-IN')} km</div></div>` : ''}
    </div>
  </div>
  ${timeRow ? `<div class="grid3">${timeRow}</div>` : ''}
  ${jobCard.complaints ? `<div style="margin-top:14px;padding-top:14px;border-top:1px solid #1f2431"><div class="lbl">Complaints / Notes</div><div style="margin-top:5px;font-size:12px;color:#9ca3af">${jobCard.complaints}</div></div>` : ''}
</div>

<div class="card">
  <div class="sec">Services (${services.length})</div>
  ${services.length === 0
    ? '<p style="color:#6b7280;font-size:13px">No services added yet.</p>'
    : `<table>
        <thead><tr><th>Service Name</th><th style="text-align:center">Status</th><th style="text-align:right">Price</th></tr></thead>
        <tbody>${serviceRows}</tbody>
        <tfoot><tr style="background:#1a1e27">
          <td colspan="2" style="padding:10px 14px;font-weight:700;color:#9ca3af;font-size:12px">Services Total (${services.length} service${services.length !== 1 ? 's' : ''})</td>
          <td style="padding:10px 14px;text-align:right;font-weight:800;color:#c4b5fd;font-size:15px">${fmt(servicesTotal)}</td>
        </tr></tfoot>
      </table>`}
</div>

${salesProducts.length > 0 ? `
<div class="card">
  <div class="sec">Sales Products (${salesProducts.length})</div>
  <table>
    <thead><tr><th>Product</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>${salesProductRows}</tbody>
    <tfoot><tr style="background:#1a1e27">
      <td colspan="3" style="padding:10px 14px;font-weight:700;color:#9ca3af;font-size:12px">Sales Products Total</td>
      <td style="padding:10px 14px;text-align:right;font-weight:800;color:#38bdf8;font-size:15px">${fmt(salesTotal)}</td>
    </tr></tfoot>
  </table>
</div>` : ''}

<div class="card">
  <div class="sec">Billing Summary</div>
  <div style="max-width:340px;margin-left:auto">
    <div class="row"><span style="color:#9ca3af">Base Amount</span><span>${fmt(jobCard.base_amount)}</span></div>
    <div class="row"><span style="color:#9ca3af">GST (${jobCard.gst_percent || 0}%)</span><span>${fmt(jobCard.gst_amount)}</span></div>
    <div class="row"><span style="color:#9ca3af">Services Total</span><span>${fmt(servicesTotal)}</span></div>
    ${salesTotal > 0 ? `<div class="row"><span style="color:#9ca3af">Sales Products</span><span style="color:#38bdf8">${fmt(salesTotal)}</span></div>` : ''}
    <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:2px solid #252a36;font-weight:800;font-size:15px">
      <span style="color:#fff">Grand Total</span><span style="color:#c4b5fd">${fmt(total)}</span>
    </div>
    <div class="row"><span style="color:#34d399">Paid</span><span style="color:#34d399;font-weight:600">${fmt(paid)}</span></div>
    <div style="display:flex;justify-content:space-between;padding:10px 0;font-weight:700">
      <span style="color:${outstanding > 0 ? '#fbbf24' : '#34d399'}">Outstanding</span>
      <span style="color:${outstanding > 0 ? '#fbbf24' : '#34d399'}">${fmt(outstanding)}</span>
    </div>
  </div>
</div>

${payments.length > 0 ? `
<div class="card">
  <div class="sec">Payments (${payments.length})</div>
  <table>
    <thead><tr><th style="text-align:center">#</th><th>Date</th><th>Method</th><th style="text-align:right">Amount</th><th>Notes</th></tr></thead>
    <tbody>${paymentRows}</tbody>
  </table>
</div>` : ''}

<div style="text-align:center;color:#374151;font-size:11px;margin-top:20px;padding-top:16px;border-top:1px solid #1a1e27">
  Thank you for your business &nbsp;·&nbsp; ${jobCard.job_card_number || ''} &nbsp;·&nbsp; Detailing CRM
</div>

</div>
</body>
</html>`;
}

export function downloadJobCardInvoice(jobCard) {
  const html = buildInvoiceHTML(jobCard);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `invoice-${(jobCard.job_card_number || jobCard.id || 'jc').replace(/\s+/g, '-')}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
