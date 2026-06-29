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
