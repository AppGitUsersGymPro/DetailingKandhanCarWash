import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

// ─── Shared styled-Excel engine ────────────────────────────────────────────────
// Colors (ARGB)
const C = {
  titleBg:      'FF0F172A', titleFg:      'FFFFFFFF',
  subBg:        'FF1E293B', subFg:        'FF94A3B8',
  headerBg:     'FF4F46E5', headerFg:     'FFFFFFFF', headerBorder: 'FF3730A3',
  rowEven:      'FFFFFFFF', rowOdd:       'FFF5F3FF',
  cellBorder:   'FFE2E8F0', cellFg:       'FF1E293B',
  totalsBg:     'FFE0E7FF', totalsFg:     'FF1E1B4B', totalsBorderTop: 'FF4F46E5',
};

function border(style, color) { return { style, color: { argb: color } }; }

function _addSheet(wb, { name, title, subtitle, headers, rows, totals, colWidths }) {
  const ws  = wb.addWorksheet(name);
  const n   = headers.length;
  let   ri  = 1;

  // Column widths
  headers.forEach((_, i) => { ws.getColumn(i + 1).width = colWidths?.[i] ?? 18; });

  // Title row (merged, dark bg)
  ws.mergeCells(ri, 1, ri, n);
  const tc = ws.getCell(ri, 1);
  tc.value = title;
  tc.font  = { bold: true, size: 13, color: { argb: C.titleFg } };
  tc.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.titleBg } };
  tc.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(ri).height = 28;
  ri++;

  // Subtitle row
  if (subtitle) {
    ws.mergeCells(ri, 1, ri, n);
    const sc = ws.getCell(ri, 1);
    sc.value = subtitle;
    sc.font  = { size: 9, italic: true, color: { argb: C.subFg } };
    sc.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.subBg } };
    sc.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    ws.getRow(ri).height = 17;
    ri++;
  }

  ri++; // blank spacer

  // Header row (indigo bg, white bold)
  headers.forEach((h, ci) => {
    const hc = ws.getCell(ri, ci + 1);
    hc.value = h;
    hc.font  = { bold: true, size: 10, color: { argb: C.headerFg } };
    hc.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headerBg } };
    hc.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    hc.border = {
      top: border('thin', C.headerBorder), bottom: border('thin', C.headerBorder),
      left: border('thin', C.headerBorder), right: border('thin', C.headerBorder),
    };
  });
  ws.getRow(ri).height = 22;
  ws.autoFilter = { from: { row: ri, column: 1 }, to: { row: ri, column: n } };
  ri++;

  // Data rows (alternating white / light purple tint)
  rows.forEach((rowData, rIdx) => {
    const bg = rIdx % 2 === 0 ? C.rowEven : C.rowOdd;
    rowData.forEach((val, ci) => {
      const dc = ws.getCell(ri, ci + 1);
      dc.value = val ?? '';
      dc.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      dc.font  = { size: 9, color: { argb: C.cellFg } };
      dc.alignment = { vertical: 'middle' };
      dc.border = {
        top: border('hair', C.cellBorder), bottom: border('hair', C.cellBorder),
        left: border('thin', C.cellBorder), right: border('thin', C.cellBorder),
      };
    });
    ws.getRow(ri).height = 18;
    ri++;
  });

  // Totals row (indigo-100 bg, bold, thick top border)
  if (totals?.length) {
    totals.forEach((val, ci) => {
      const vc = ws.getCell(ri, ci + 1);
      vc.value = val ?? '';
      vc.font  = { bold: true, size: 10, color: { argb: C.totalsFg } };
      vc.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.totalsBg } };
      vc.alignment = { vertical: 'middle' };
      vc.border = {
        top:    border('medium', C.totalsBorderTop),
        bottom: border('thin',   C.totalsBorderTop),
        left:   border('thin',   C.cellBorder),
        right:  border('thin',   C.cellBorder),
      };
    });
    ws.getRow(ri).height = 20;
  }
}

export async function styledXlsxDownload(filename, sheets) {
  const wb = new ExcelJS.Workbook();
  wb.creator  = 'Detailing CRM';
  wb.created  = new Date();
  sheets.forEach(s => _addSheet(wb, s));
  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const r = (n) => Number(n || 0).toFixed(2);
const fmtRs = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const METHOD_LABEL = {
  cash: 'Cash', upi: 'UPI', card: 'Card',
  netbanking: 'Net Banking', cheque: 'Cheque', other: 'Other',
};

// ─── Invoice PDF ──────────────────────────────────────

export function downloadInvoicePdf(invoice) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();

  // ── Title bar
  doc.setFillColor(30, 30, 30);
  doc.rect(0, 0, W, 22, 'F');
  doc.setTextColor(230, 230, 230);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('PURCHASE INVOICE', 14, 14);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(invoice.invoice_number, W - 14, 14, { align: 'right' });

  // ── Meta block
  doc.setTextColor(50, 50, 50);
  let y = 30;
  const meta = [
    ['Invoice #', invoice.invoice_number],
    invoice.vendor_invoice_id ? ['Vendor Ref #', invoice.vendor_invoice_id] : null,
    ['Vendor', invoice.vendor_name || ''],
    ['Date', invoice.invoice_date || ''],
    ['Status', (invoice.payment_status || '').toUpperCase()],
  ].filter(Boolean);

  for (const [label, val] of meta) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(label, 14, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text(String(val), 55, y);
    y += 6;
  }

  y += 4;

  // ── Items table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text('Items', 14, y);
  y += 2;

  const itemRows = (invoice.items || []).map((it) => {
    const total = Number(it.quantity) * Number(it.unit_price);
    return [
      it.product_name || '',
      it.product_brand || '—',
      String(it.quantity),
      fmtRs(it.unit_price),
      fmtRs(total),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['Product', 'Brand', 'Qty', 'Cost Price', 'Line Total']],
    body: itemRows,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [45, 45, 45], textColor: 220, fontStyle: 'bold' },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right', fontStyle: 'bold' },
    },
    theme: 'grid',
  });

  y = doc.lastAutoTable.finalY + 6;

  // ── Summary
  autoTable(doc, {
    startY: y,
    body: [
      ['Total Amount', fmtRs(invoice.total_amount)],
      ['Total Paid', fmtRs(invoice.total_paid)],
      ['Outstanding', fmtRs(invoice.outstanding_amount)],
    ],
    styles: { fontSize: 8.5 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: [80, 80, 80] },
      1: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: W - 90 },
    tableWidth: 76,
    theme: 'plain',
  });

  y = doc.lastAutoTable.finalY + 8;

  // ── Payments table
  if ((invoice.payments || []).length > 0) {
    if (y > doc.internal.pageSize.getHeight() - 50) {
      doc.addPage();
      y = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text('Payment Installments', 14, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [['Date', 'Method', 'Reference', 'Amount']],
      body: invoice.payments.map((p) => [
        p.payment_date || '',
        METHOD_LABEL[p.payment_method] || p.payment_method || '—',
        p.payment_reference || '—',
        fmtRs(p.amount),
      ]),
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [45, 45, 45], textColor: 220, fontStyle: 'bold' },
      columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } },
      theme: 'grid',
    });
  }

  // ── Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(
      `Generated ${new Date().toLocaleDateString('en-IN')} · Page ${i} of ${pageCount}`,
      W / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' }
    );
  }

  doc.save(`${invoice.invoice_number}.pdf`);
}

// ─── Invoices Excel ────────────────────────────────────

export async function exportInvoicesExcel(rows, filename = 'invoices.xlsx') {
  const headers = ['Invoice #', 'Vendor Ref #', 'Vendor', 'Date', 'Total (Rs.)', 'Paid (Rs.)', 'Outstanding (Rs.)', 'Status'];
  const dataRows = rows.map((inv) => [
    inv.invoice_number,
    inv.vendor_invoice_id || '',
    inv.vendor_name || '',
    inv.invoice_date || '',
    Number(inv.total_amount)       || 0,
    Number(inv.total_paid)         || 0,
    Number(inv.outstanding_amount) || 0,
    (inv.payment_status || '').toUpperCase(),
  ]);
  const totalsRow = [
    'TOTAL', '', '', '',
    dataRows.reduce((s, r) => s + r[4], 0),
    dataRows.reduce((s, r) => s + r[5], 0),
    dataRows.reduce((s, r) => s + r[6], 0),
    '',
  ];

  await styledXlsxDownload(filename, [{
    name: 'Invoices',
    title: 'Vendor Invoices',
    subtitle: `Generated: ${new Date().toLocaleDateString('en-IN')} · ${rows.length} invoice${rows.length !== 1 ? 's' : ''}`,
    headers,
    rows: dataRows,
    totals: totalsRow,
    colWidths: [18, 18, 26, 13, 16, 16, 20, 13],
  }]);
}

// ─── Inventory Excel ────────────────────────────────────

export function exportInventoryExcel(rows, filename = 'inventory.xlsx') {
  const data = rows.map((item) => ({
    'Product':            item.product_name || '',
    'Code':               item.product_code || '',
    'Brand':              item.brand || '',
    'Type':               item.type_name || '',
    'Category':           item.category || '',
    'Cost Price (Rs.)':   item.cost_price != null ? r(item.cost_price) : '',
    'Selling Price (Rs.)': item.selling_price != null ? r(item.selling_price) : '',
    'Qty Available':      r(item.quantity_available),
    'Min Threshold':      r(item.minimum_threshold),
    'Unit':               item.unit || '',
    'Status':             Number(item.quantity_available) <= 0
                            ? 'Out of Stock'
                            : item.is_low_stock
                            ? 'Low Stock'
                            : 'In Stock',
    'Last Updated':       item.last_updated?.slice(0, 10) || '',
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [24, 12, 16, 14, 14, 16, 18, 14, 14, 8, 12, 12].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
  XLSX.writeFile(wb, filename);
}
