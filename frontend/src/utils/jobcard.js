export const jobCardTotal = (jobCard) =>
  (jobCard?.job_card_services || []).reduce(
    (sum, s) => sum + Number(s.price_at_time || 0),
    0
  );

export function openWhatsAppForJobCard(job, toast) {
  const raw   = (job.phone_number || '').replace(/\D/g, '');
  const phone = raw.length === 10 ? `91${raw}` : raw;
  if (!phone) {
    if (toast) toast.error('No phone number on record for this customer.');
    return;
  }

  const total = Number(job.total_amount || 0) || jobCardTotal(job);
  const due   = Number(job.outstanding  || 0);
  const paid  = job.paid_amount != null
    ? Number(job.paid_amount)
    : Math.max(0, total - due);

  const services  = (job.job_card_services || [])
    .map(s => `  • ${s.service_name}`)
    .join('\n');
  const shareUrl  = job.share_token
    ? `${window.location.origin}/invoice/view/${job.share_token}`
    : null;

  const msg = [
    `Hi ${job.customer_name || 'there'} 👋`,
    '',
    `📋 *Job Card:* ${job.job_card_number}`,
    `📅 *Date:* ${job.job_card_date || ''}`,
    `🚗 *Vehicle:* ${job.vehicle_number || ''}`,
    services ? `🔧 *Services:*\n${services}` : null,
    '',
    `💰 *Total: ₹${total.toLocaleString('en-IN')}*`,
    (paid > 0 && due > 0) ? `✅ Paid: ₹${paid.toLocaleString('en-IN')}` : null,
    due > 0 ? `⏳ *Outstanding: ₹${due.toLocaleString('en-IN')}*` : `✅ Fully Paid`,
    shareUrl ? `\n🔗 View Invoice: ${shareUrl}` : null,
    '',
    `Thank you! 🙏`,
  ].filter(l => l !== null).join('\n');

  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

const ESTIMATION_VEHICLE_LABEL = {
  two_wheeler: 'Two Wheeler',
  three_wheeler: 'Three Wheeler',
  four_wheeler: 'Four Wheeler',
  others: 'Others',
};

export function openWhatsAppForEstimation(estimation, toast) {
  const raw   = (estimation.customer_phone_number || '').replace(/\D/g, '');
  const phone = raw.length === 10 ? `91${raw}` : raw;
  if (!phone) {
    if (toast) toast.error('No phone number on record for this customer.');
    return;
  }

  const items = estimation.items || [];
  const total = Number(estimation.total_amount || 0)
    || items.reduce((sum, it) => sum + Number(it.amount || 0), 0);

  const date = estimation.created_at
    ? new Date(estimation.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const vehicleLabel = [
    ESTIMATION_VEHICLE_LABEL[estimation.vehicle_type] || estimation.vehicle_type,
    estimation.vehicle_type === 'four_wheeler' ? estimation.vehicle_sub_type : null,
  ].filter(Boolean).join(' · ');

  const services = items
    .map(it => `  • ${it.service_name} — ₹${Number(it.amount || 0).toLocaleString('en-IN')}`)
    .join('\n');

  // Only saved estimations have a share token; a preview has nothing to link to yet.
  const shareUrl = estimation.share_token
    ? `${window.location.origin}/estimation/view/${estimation.share_token}`
    : null;

  const msg = [
    `Hi ${estimation.customer_name || 'there'} 👋`,
    '',
    `📄 *Estimate*`,
    `📅 *Date:* ${date}`,
    estimation.vehicle_name || vehicleLabel
      ? `🚗 *Vehicle:* ${[estimation.vehicle_name, vehicleLabel ? `(${vehicleLabel})` : null].filter(Boolean).join(' ')}`
      : null,
    services ? `🔧 *Services:*\n${services}` : null,
    '',
    `💰 *Estimated Total: ₹${total.toLocaleString('en-IN')}*`,
    shareUrl ? `\n🔗 View Estimate: ${shareUrl}` : null,
    '',
    `Thank you! 🙏`,
  ].filter(l => l !== null).join('\n');

  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

export function openWhatsAppForSale(record, toast) {
  const raw   = (record.phone_number || '').replace(/\D/g, '');
  const phone = raw.length === 10 ? `91${raw}` : raw;
  if (!phone) {
    if (toast) toast.error('No phone number on record for this customer.');
    return;
  }

  const total    = Number(record.total_amount || 0);
  const items    = (record.items || [])
    .map(it => `  • ${it.product_name} × ${it.quantity}`)
    .join('\n');
  const shareUrl = record.share_token
    ? `${window.location.origin}/sales/view/${record.share_token}`
    : null;

  const msg = [
    `Hi ${record.customer_name || 'there'} 👋`,
    '',
    `🧾 *Order:* ${record.order_number}`,
    `📅 *Date:* ${record.date || ''}`,
    items ? `🛍️ *Items:*\n${items}` : null,
    '',
    `💰 *Total: ₹${total.toLocaleString('en-IN')}*`,
    shareUrl ? `\n🔗 View Invoice: ${shareUrl}` : null,
    '',
    `Thank you! 🙏`,
  ].filter(l => l !== null).join('\n');

  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}
