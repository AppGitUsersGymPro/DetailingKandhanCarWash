const fmt = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (s) => {
  if (!s) return '—';
  return new Date(s.length <= 10 ? s + 'T00:00:00' : s).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const VEHICLE_LABEL = {
  two_wheeler: 'Two Wheeler',
  three_wheeler: 'Three Wheeler',
  four_wheeler: 'Four Wheeler',
  others: 'Others',
};

// Values land inside an HTML string, so escape anything user-supplied.
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function buildEstimationHTML(est, biz = {}) {
  const items    = est.items || [];
  const total    = Number(est.total_amount || 0)
    || items.reduce((sum, it) => sum + Number(it.amount || 0), 0);
  const estNo    = `EST-${String(est.id ?? '').padStart(4, '0')}`;
  const genDate  = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const bizName    = esc(biz.name || 'Detailing Workshop');
  const bizPhone   = esc(biz.phone || '');
  const bizAddress = esc(biz.address || '');
  const bizGst     = esc(biz.gst_number || '');

  const vehicleLabel = [
    VEHICLE_LABEL[est.vehicle_type] || est.vehicle_type,
    est.vehicle_type === 'four_wheeler' ? est.vehicle_sub_type : null,
  ].filter(Boolean).join(' · ');

  const itemRows = items.map(it => `<tr>
      <td style="padding:9px 10px;border-bottom:1px solid #1f2431">
        <div style="font-weight:600;color:#e5e7eb">${esc(it.service_name) || '—'}</div>
      </td>
      <td style="padding:9px 10px;border-bottom:1px solid #1f2431;text-align:right;font-weight:700;color:#38bdf8;white-space:nowrap">${fmt(it.amount)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Estimate — ${esc(estNo)}</title>
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
.note{background:#1a1e27;border:1px solid #252a36;border-radius:8px;padding:10px 12px;font-size:11px;color:#9ca3af;margin-top:10px}
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
      <div style="font-size:20px;font-weight:800;color:#fff;letter-spacing:-.3px">📄 ${bizName}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px">Service Estimate</div>
      ${bizPhone   ? `<div style="font-size:11px;color:#9ca3af;margin-top:6px">📞 ${bizPhone}</div>`   : ''}
      ${bizAddress ? `<div style="font-size:11px;color:#9ca3af;margin-top:3px">📍 ${bizAddress}</div>` : ''}
      ${bizGst     ? `<div style="font-size:11px;color:#9ca3af;margin-top:3px">GST: ${bizGst}</div>`   : ''}
    </div>
    <div class="hdr-right">
      <div style="font-size:15px;color:#38bdf8;font-weight:800">${esc(estNo)}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:3px">Date: ${fmtDate(est.created_at)}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:2px">Generated: ${genDate}</div>
    </div>
  </div>
</div>

<div class="card">
  <div class="grid2">
    <div>
      <div class="sec">Customer</div>
      <div style="margin-bottom:8px"><div class="lbl">Name</div><div class="val">${esc(est.customer_name) || '—'}</div></div>
      ${est.customer_phone_number ? `<div><div class="lbl">Phone</div><div class="val">${esc(est.customer_phone_number)}</div></div>` : ''}
    </div>
    <div>
      <div class="sec">Vehicle</div>
      ${est.vehicle_name ? `<div style="margin-bottom:8px"><div class="lbl">Vehicle</div><div class="val" style="color:#38bdf8;font-weight:700">${esc(est.vehicle_name)}</div></div>` : ''}
      ${vehicleLabel ? `<div><div class="lbl">Type</div><div class="val">${esc(vehicleLabel)}</div></div>` : ''}
    </div>
  </div>
</div>

<div class="card">
  <div class="sec">Services (${items.length})</div>
  ${items.length === 0 ? '<p style="color:#6b7280;font-size:13px">No services.</p>' : `
  <div class="tbl-wrap">
  <table>
    <thead><tr>
      <th>Service</th>
      <th style="text-align:right;white-space:nowrap">Amount</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
    <tfoot><tr style="background:#1a1e27">
      <td style="padding:10px 10px;font-weight:800;color:#fff;font-size:13px">Estimated Total</td>
      <td style="padding:10px 10px;text-align:right;font-weight:800;color:#38bdf8;font-size:15px;white-space:nowrap">${fmt(total)}</td>
    </tr></tfoot>
  </table>
  </div>`}
  <div class="note">
    This is an estimate only — final charges may vary based on the actual condition of the vehicle and any additional work approved by you.
  </div>
</div>

<div style="text-align:center;color:#374151;font-size:11px;margin-top:16px;padding-top:14px;border-top:1px solid #1a1e27">
  Thank you &nbsp;·&nbsp; ${esc(estNo)} &nbsp;·&nbsp; ${bizName}
</div>

</div>
</body>
</html>`;
}
