const fmt = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (s) => {
  if (!s) return '—';
  return new Date(s.length <= 10 ? s + 'T00:00:00' : s).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const METHOD = {
  cash: 'Cash', upi: 'UPI', card: 'Card',
  netbanking: 'Net Banking', cheque: 'Cheque', other: 'Other',
};

const UNIT_LABEL = { l: 'L', ml: 'ml', pcs: 'pcs', kg: 'kg', g: 'g', box: 'Box', set: 'Set' };

function buildSalesInvoiceHTML(record) {
  /* record is a feed item (standalone or job_card) */
  const items     = record.items || [];
  const total     = Number(record.total_amount || 0);
  const isJC      = record.type === 'job_card';
  const billNo    = record.order_number || record.id;
  const genDate   = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const itemRows = items.map(it => {
    const unitStr = `${it.unit_amount} ${UNIT_LABEL[it.unit] || it.unit || ''}`.trim();
    const desc    = [it.brand, unitStr].filter(Boolean).join(' · ');
    return `<tr>
      <td style="padding:10px 14px;border-bottom:1px solid #1f2431">
        <div style="font-weight:600;color:#e5e7eb">${it.product_name || '—'}</div>
        ${desc ? `<div style="font-size:11px;color:#6b7280;margin-top:2px">${desc}</div>` : ''}
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #1f2431;text-align:center;color:#9ca3af">${it.quantity}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #1f2431;text-align:right;color:#9ca3af">${fmt(it.unit_price)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #1f2431;text-align:right;font-weight:700;color:#38bdf8">${fmt(it.line_total)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Sales Invoice — ${billNo}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#0b0d12;color:#e5e7eb;padding:32px}
.page{max-width:780px;margin:0 auto}
.card{background:#13161d;border:1px solid #252a36;border-radius:12px;padding:22px 26px;margin-bottom:16px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.lbl{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px}
.val{font-size:13px;color:#e5e7eb;font-weight:500}
table{width:100%;border-collapse:collapse;font-size:13px}
th{padding:9px 14px;color:#6b7280;font-weight:500;text-align:left;border-bottom:1px solid #252a36;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
.chip{display:inline-block;padding:5px 14px;border-radius:20px;font-size:11px;font-weight:700}
.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1f2431}
@media print{body{background:#fff;color:#111}.card{background:#fff;border-color:#e5e7eb}}
</style>
</head>
<body>
<div class="page">

<div class="card" style="background:linear-gradient(135deg,#1a1e27,#0f1117);margin-bottom:20px">
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-.3px">🛒 Sales Invoice</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px">
        ${isJC ? 'Via Job Card' : 'Direct Sale'}
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:16px;color:#38bdf8;font-weight:800">${billNo}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:3px">Date: ${fmtDate(record.date)}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:2px">Generated: ${genDate}</div>
    </div>
  </div>
</div>

<div class="card">
  <div class="grid2">
    <div>
      <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px">Customer</div>
      <div style="margin-bottom:8px"><div class="lbl">Name</div><div class="val">${record.customer_name || '—'}</div></div>
      ${record.phone_number ? `<div><div class="lbl">Phone</div><div class="val">${record.phone_number}</div></div>` : ''}
    </div>
    ${record.vehicle_number ? `
    <div>
      <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px">Vehicle</div>
      <div><div class="lbl">Vehicle Number</div><div class="val" style="color:#38bdf8;font-weight:700">${record.vehicle_number}</div></div>
    </div>` : ''}
  </div>
  ${record.payment_method ? `
  <div style="margin-top:14px;padding-top:14px;border-top:1px solid #1f2431">
    <div class="lbl">Payment Method</div>
    <div class="val">${METHOD[record.payment_method] || record.payment_method}</div>
  </div>` : ''}
</div>

<div class="card">
  <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px">
    Items (${items.length})
  </div>
  ${items.length === 0 ? '<p style="color:#6b7280;font-size:13px">No items.</p>' : `
  <table>
    <thead><tr>
      <th>Product</th>
      <th style="text-align:center">Qty</th>
      <th style="text-align:right">Unit Price</th>
      <th style="text-align:right">Total</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
    <tfoot><tr style="background:#1a1e27">
      <td colspan="3" style="padding:11px 14px;font-weight:800;color:#fff;font-size:14px">Grand Total</td>
      <td style="padding:11px 14px;text-align:right;font-weight:800;color:#38bdf8;font-size:16px">${fmt(total)}</td>
    </tr></tfoot>
  </table>`}
</div>

<div style="text-align:center;color:#374151;font-size:11px;margin-top:20px;padding-top:16px;border-top:1px solid #1a1e27">
  Thank you for your purchase &nbsp;·&nbsp; ${billNo} &nbsp;·&nbsp; Detailing CRM
</div>

</div>
</body>
</html>`;
}

export function downloadSalesInvoice(record) {
  const html = buildSalesInvoiceHTML(record);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `sales-${(record.order_number || record.id || 'inv').replace(/\s+/g, '-')}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
