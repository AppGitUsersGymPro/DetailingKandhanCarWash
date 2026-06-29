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

export function buildSalesInvoiceHTML(record, biz = {}) {
  /* record is a feed item (standalone or job_card) */
  const items     = record.items || [];
  const total     = Number(record.total_amount || 0);
  const isJC      = record.type === 'job_card';
  const billNo    = record.order_number || record.id;
  const genDate   = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const bizName    = biz.name    || 'Detailing Workshop';
  const bizPhone   = biz.phone   || '';
  const bizAddress = biz.address || '';
  const bizGst     = biz.gst_number || '';

  const itemRows = items.map(it => {
    const unitStr = `${it.unit_amount} ${UNIT_LABEL[it.unit] || it.unit || ''}`.trim();
    const desc    = [it.brand, unitStr].filter(Boolean).join(' · ');
    return `<tr>
      <td style="padding:9px 10px;border-bottom:1px solid #1f2431">
        <div style="font-weight:600;color:#e5e7eb">${it.product_name || '—'}</div>
        ${desc ? `<div style="font-size:10px;color:#6b7280;margin-top:2px">${desc}</div>` : ''}
      </td>
      <td style="padding:9px 10px;border-bottom:1px solid #1f2431;text-align:center;color:#9ca3af;white-space:nowrap">${it.quantity}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #1f2431;text-align:right;color:#9ca3af;white-space:nowrap">${fmt(it.unit_price)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #1f2431;text-align:right;font-weight:700;color:#38bdf8;white-space:nowrap">${fmt(it.line_total)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sales Invoice — ${billNo}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#0b0d12;color:#e5e7eb;padding:12px}
.page{max-width:780px;margin:0 auto}
.card{background:#13161d;border:1px solid #252a36;border-radius:10px;padding:14px;margin-bottom:10px}
.hdr{display:flex;flex-direction:column;gap:12px}
.hdr-right{text-align:left;margin-top:4px}
.grid2{display:grid;grid-template-columns:1fr;gap:14px}
.lbl{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px}
.val{font-size:13px;color:#e5e7eb;font-weight:500}
.sec{font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px}
.tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 -2px}
table{width:100%;border-collapse:collapse;font-size:12px;min-width:320px}
th{padding:8px 10px;color:#6b7280;font-weight:500;text-align:left;border-bottom:1px solid #252a36;font-size:10px;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
td{vertical-align:top}
.row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #1f2431}
@media(min-width:560px){
  body{padding:28px}
  .card{padding:20px 24px;margin-bottom:14px;border-radius:12px}
  .hdr{flex-direction:row;justify-content:space-between;align-items:flex-start}
  .hdr-right{text-align:right;margin-top:0}
  .grid2{grid-template-columns:1fr 1fr;gap:20px}
  table{font-size:13px}
  th{padding:9px 14px}
}
@media print{body{background:#fff;color:#111;padding:16px}.card{background:#fff;border-color:#e5e7eb}}
</style>
</head>
<body>
<div class="page">

<div class="card" style="background:linear-gradient(135deg,#1a1e27,#0f1117);margin-bottom:14px">
  <div class="hdr">
    <div>
      <div style="font-size:20px;font-weight:800;color:#fff;letter-spacing:-.3px">🛒 ${bizName}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px">Sales Invoice · ${isJC ? 'Via Job Card' : 'Direct Sale'}</div>
      ${bizPhone   ? `<div style="font-size:11px;color:#9ca3af;margin-top:6px">📞 ${bizPhone}</div>`   : ''}
      ${bizAddress ? `<div style="font-size:11px;color:#9ca3af;margin-top:3px">📍 ${bizAddress}</div>` : ''}
      ${bizGst     ? `<div style="font-size:11px;color:#9ca3af;margin-top:3px">GST: ${bizGst}</div>`   : ''}
    </div>
    <div class="hdr-right">
      <div style="font-size:15px;color:#38bdf8;font-weight:800">${billNo}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:3px">Date: ${fmtDate(record.date)}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:2px">Generated: ${genDate}</div>
    </div>
  </div>
</div>

<div class="card">
  <div class="grid2">
    <div>
      <div class="sec">Customer</div>
      <div style="margin-bottom:8px"><div class="lbl">Name</div><div class="val">${record.customer_name || '—'}</div></div>
      ${record.phone_number ? `<div><div class="lbl">Phone</div><div class="val">${record.phone_number}</div></div>` : ''}
    </div>
    ${record.vehicle_number ? `
    <div>
      <div class="sec">Vehicle</div>
      <div><div class="lbl">Vehicle Number</div><div class="val" style="color:#38bdf8;font-weight:700">${record.vehicle_number}</div></div>
    </div>` : ''}
  </div>
  ${record.payment_method ? `
  <div style="margin-top:12px;padding-top:12px;border-top:1px solid #1f2431">
    <div class="lbl">Payment Method</div>
    <div class="val">${METHOD[record.payment_method] || record.payment_method}</div>
  </div>` : ''}
</div>

<div class="card">
  <div class="sec">Items (${items.length})</div>
  ${items.length === 0 ? '<p style="color:#6b7280;font-size:13px">No items.</p>' : `
  <div class="tbl-wrap">
  <table>
    <thead><tr>
      <th>Product</th>
      <th style="text-align:center">Qty</th>
      <th style="text-align:right">Unit Price</th>
      <th style="text-align:right;white-space:nowrap">Total</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
    <tfoot><tr style="background:#1a1e27">
      <td colspan="3" style="padding:10px 10px;font-weight:800;color:#fff;font-size:13px">Grand Total</td>
      <td style="padding:10px 10px;text-align:right;font-weight:800;color:#38bdf8;font-size:15px;white-space:nowrap">${fmt(total)}</td>
    </tr></tfoot>
  </table>
  </div>`}
</div>

<div style="text-align:center;color:#374151;font-size:11px;margin-top:16px;padding-top:14px;border-top:1px solid #1a1e27">
  Thank you for your purchase &nbsp;·&nbsp; ${billNo} &nbsp;·&nbsp; ${bizName}
</div>

</div>
</body>
</html>`;
}

export async function downloadSalesInvoice(record) {
  let biz = {};
  try {
    const { getSettings } = await import('../api/settings.js');
    const settings = await getSettings();
    const map = Object.fromEntries(settings.map(s => [s.field_name, s.value]));
    biz = {
      name:       map.business_name       || '',
      phone:      map.business_phone      || '',
      address:    map.business_address    || '',
      gst_number: map.business_gst_number || '',
    };
  } catch { /* fall back to defaults if settings fetch fails */ }
  const html = buildSalesInvoiceHTML(record, biz);
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
