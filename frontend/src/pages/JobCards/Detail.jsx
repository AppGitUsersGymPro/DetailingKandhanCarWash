import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, CheckCircle2, Plus, Trash2, UserPlus, Wrench, IndianRupee, Trash, CreditCard, ClipboardList, Download } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import Badge from '../../components/Badge';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { Field, Input, Select } from '../../components/Field';
import { useToast } from '../../components/Toast';
import {
  getJobCard,
  updateJobCard,
  deleteJobCard,
  addJobCardService,
  removeJobCardService,
  addJobCardServiceEmployee,
  removeJobCardServiceEmployee,
  addJobCardPayment,
  removeJobCardPayment,
  listJobCardPayments,
  updateJobCardService,
  loadProductsUsedForJobCard,
  listInventoryOptions,
  addJobCardProductUsage,
  removeJobCardProductUsage,
} from '../../api/jobcards';
import { listServices } from '../../api/services';
import { listEmployees } from '../../api/employees';
import { extractError } from '../../api/axios';

const formatCurrency = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function JobCardDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState(null);
  const [services, setServices] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [productUsed, setProductUsed] = useState(false); // master modal
  const [serviceUsageId, setServiceUsageId] = useState(null); // per-service modal: holds JobCardService.id
  const [serviceModal, setServiceModal] = useState(false);
  const [employeeModal, setEmployeeModal] = useState(null);
  const [paymentModal, setPaymentModal] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemoveService, setConfirmRemoveService] = useState(null);
  const [confirmRemovePayment, setConfirmRemovePayment] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [j, s, e] = await Promise.all([
        getJobCard(id),
        listServices(),
        listEmployees(),
      ]);
      setJob(j);
      setServices(Array.isArray(s) ? s : (s.results || []));
      setEmployees(Array.isArray(e) ? e : (e.results || []));
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const reload = async () => {
    try {
      const j = await getJobCard(id);
      setJob(j);
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  const markCompleted = async () => {
    setCompleting(true);
    try {
      await updateJobCard(id, {
        job_card_number: job.job_card_number,
        customer_asset: job.customer_asset,
        job_card_date: job.job_card_date,
        vehicle_kilometers: job.vehicle_kilometers,
        vehicle_entry_time: job.vehicle_entry_time,
        vehicle_exit_time: job.vehicle_exit_time,
        complaints: job.complaints,
        job_card_status: 'COMPLETED',
      });
      toast.success('Job card completed. Inventory deducted.');
      await reload();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setCompleting(false);
    }
  };

  const onDelete = async () => {
    setDeleting(true);
    try {
      await deleteJobCard(id);
      toast.success('Job card deleted');
      navigate('/jobcards');
    } catch (err) {
      toast.error(extractError(err));
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const onRemoveService = async () => {
    if (!confirmRemoveService) return;
    try {
      await removeJobCardService(confirmRemoveService);
      toast.success('Service removed');
      setConfirmRemoveService(null);
      await reload();
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  const onRemovePayment = async () => {
    if (!confirmRemovePayment) return;
    try {
      await removeJobCardPayment(confirmRemovePayment);
      toast.success('Payment removed');
      setConfirmRemovePayment(null);
      await reload();
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  if (loading) return <Loading />;
  if (!job) return <div className="text-gray-400">Job card not found</div>;

  const isCompleted = job.job_card_status === 'COMPLETED';

  return (
    <div>
      <PageHeader
        title={job.job_card_number}
        subtitle={`${job.customer_name || ''} · ${job.vehicle_number || ''}`}
        breadcrumbs={
          <Link to="/jobcards" className="hover:text-gray-300 inline-flex items-center gap-1">
            <ChevronLeft size={12} /> Back to Job Cards
          </Link>
        }
        actions={
          <>
            <Badge variant={isCompleted ? 'green' : 'yellow'} className="mr-2 text-sm px-3 py-1">
              {isCompleted ? 'Completed' : 'In Progress'}
            </Badge>
            {!isCompleted && (
              <Button variant="success" onClick={() => setProductUsed(true)} loading={completing}>
                <CheckCircle2 size={16} /> Mark Completed
              </Button>
            )}
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash size={16} /> Delete
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-bg-card border border-border rounded-xl">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-100 flex items-center gap-2">
                <Wrench size={16} /> Services
              </h2>
              {!isCompleted && (
                <Button size="sm" onClick={() => setServiceModal(true)}>
                  <Plus size={14} /> Add Service
                </Button>
              )}
            </div>
            {(job.job_card_services || []).length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-500">
                No services added yet
              </div>
            ) : (
              <div className="divide-y divide-border">
                {job.job_card_services.map((svc) => (
                  <div key={svc.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-100">{svc.service_name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{formatCurrency(svc.price_at_time)}</div>
                        <div className="text-xs text-gray-500 mt-0.5">Status: {svc.service_status}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select value={(svc.service_status || 'pending').toLowerCase()} disabled={isCompleted} onChange={async (e) => {
                          const nextStatus = e.target.value;
                          try {
                            await updateJobCardService(svc.id, { service_status: nextStatus });
                            toast.success(`${nextStatus} status updated`);
                            await reload();
                            if (nextStatus === 'completed') {
                              setServiceUsageId(svc.id);
                            }
                          } catch (err) {
                            toast.error(extractError(err));
                          }
                        }}>
                          <option value="pending">Pending</option>
                          <option value="in_progress">In Progress</option>
                          <option value="completed">Completed</option>
                        </Select>
                        {svc.service_status === 'completed' && !isCompleted && (
                          <button
                            onClick={() => setServiceUsageId(svc.id)}
                            className="text-gray-500 hover:text-gray-200"
                            title="View / edit products used"
                          >
                            <ClipboardList size={14} />
                          </button>
                        )}
                      </div>
                      {!isCompleted && (
                        <button
                          onClick={() => setConfirmRemoveService(svc.id)}
                          className="text-gray-500 hover:text-red-400"
                          title="Remove service"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 items-center">
                      {(svc.employees || []).map((emp) => (
                        <span
                          key={emp.id}
                          className="inline-flex items-center gap-1 bg-bg-elev border border-border text-xs text-gray-200 px-2 py-1 rounded-md"
                        >
                          {emp.employee_name}
                          {!isCompleted && (
                            <button
                              onClick={async () => {
                                try {
                                  await removeJobCardServiceEmployee(emp.id);
                                  toast.success('Employee removed');
                                  await reload();
                                } catch (err) { toast.error(extractError(err)); }
                              }}
                              className="text-gray-500 hover:text-red-400 ml-1"
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </span>
                      ))}
                      {!isCompleted && (
                        <button
                          onClick={() => setEmployeeModal(svc.id)}
                          className="inline-flex items-center gap-1 bg-bg-elev hover:bg-bg-hover border border-dashed border-border text-xs text-gray-400 px-2 py-1 rounded-md transition-colors"
                        >
                          <UserPlus size={11} /> Assign Employee
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-bg-card border border-border rounded-xl p-5">
            <h2 className="text-base font-semibold text-gray-100 mb-4">Details</h2>
            <dl className="space-y-3 text-sm">
              <Detail label="Customer" value={job.customer_name} />
              <Detail label="Vehicle" value={job.vehicle_number} />
              <Detail label="Date" value={job.job_card_date} />
              <Detail label="Vehicle KM" value={job.vehicle_kilometers ?? '—'} />
              <Detail label="Entry Time" value={job.vehicle_entry_time || '—'} />
              <Detail label="Exit Time" value={job.vehicle_exit_time || '—'} />
              <Detail
                label="Complaints"
                value={job.complaints ? <span className="text-gray-200">{job.complaints}</span> : '—'}
              />
            </dl>
          </div>

          {/* Billing card */}
          <div className="bg-bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-100 flex items-center gap-2">
                <IndianRupee size={16} /> Billing
              </h2>
              <button
                onClick={() => setPaymentModal(true)}
                className="flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <Plus size={12} /> Add Payment
              </button>
            </div>
            <dl className="space-y-2 text-sm mb-4">
              <div className="flex justify-between">
                <dt className="text-gray-500">Base Amount</dt>
                <dd className="text-gray-200">{formatCurrency(job.base_amount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">GST ({job.gst_percent}%)</dt>
                <dd className="text-gray-200">{formatCurrency(job.gst_amount)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <dt className="text-gray-200 font-medium">Total</dt>
                <dd className="text-gray-100 font-semibold">{formatCurrency(job.total_amount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-emerald-400">Paid</dt>
                <dd className="text-emerald-400 font-medium">{formatCurrency(job.paid_amount)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <dt className="text-yellow-400 font-medium">Outstanding</dt>
                <dd className="text-yellow-400 font-semibold">{formatCurrency(job.outstanding)}</dd>
              </div>
            </dl>
            {/* Payment list */}
            {(job.payments || []).length > 0 && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs text-gray-500 font-medium mb-2">Payments</p>
                {job.payments.map(p => (
                  <div key={p.id} className="flex items-center justify-between text-xs">
                    <div className="min-w-0">
                      <span className="text-emerald-300 font-medium">{formatCurrency(p.amount)}</span>
                      <span className="text-gray-500 ml-2">{p.payment_date}</span>
                      <span className="text-gray-600 ml-2 capitalize">{p.payment_method}</span>
                    </div>
                    <button
                      onClick={() => setConfirmRemovePayment(p.id)}
                      className="text-gray-600 hover:text-red-400 ml-2 shrink-0"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <AddServiceModal
        open={serviceModal}
        onClose={() => setServiceModal(false)}
        services={services}
        existingIds={(job.job_card_services || []).map((s) => s.service)}
        onAdded={reload}
        jobCardId={id}
      />

      <AssignEmployeeModal
        serviceLinkId={employeeModal}
        onClose={() => setEmployeeModal(null)}
        employees={employees}
        onAdded={reload}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={onDelete}
        loading={deleting}
        title="Delete this job card?"
        message="This action cannot be undone."
      />

      <ConfirmDialog
        open={!!confirmRemoveService}
        onClose={() => setConfirmRemoveService(null)}
        onConfirm={onRemoveService}
        title="Remove this service?"
        message="The service will be removed from this job card."
        confirmText="Remove"
      />

      <AddPaymentModal
        open={paymentModal}
        onClose={() => setPaymentModal(false)}
        jobCardId={id}
        onAdded={reload}
        outstanding={job.outstanding}
        totalAmount={job.total_amount}
        jobCard={job}
      />

      <ShowProductsUsedDialog
        open={productUsed}
        onClose={() => setProductUsed(false)}
        jobCardId={id}
        onConfirm={async () => {
          await markCompleted();
          setProductUsed(false);
        }}
        confirming={completing}
      />

      <ShowProductsUsedDialog
        open={serviceUsageId !== null}
        onClose={async () => {
          setServiceUsageId(null);
          await reload();
        }}
        jobCardId={id}
        serviceId={serviceUsageId}
      />

      <ConfirmDialog
        open={!!confirmRemovePayment}
        onClose={() => setConfirmRemovePayment(null)}
        onConfirm={onRemovePayment}
        title="Remove this payment?"
        message="This payment record will be permanently deleted."
        confirmText="Remove"
      />
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500 shrink-0">{label}</dt>
      <dd className="text-gray-200 text-right">{value}</dd>
    </div>
  );
}

function AddServiceModal({ open, onClose, services, existingIds, onAdded, jobCardId }) {
  const toast = useToast();
  const [serviceId, setServiceId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (open) setServiceId(''); }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!serviceId) return;
    setSubmitting(true);
    try {
      await addJobCardService(jobCardId, { service: Number(serviceId) });
      toast.success('Service added');
      onAdded();
      onClose();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const available = services.filter((s) => !existingIds.includes(s.id));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Service to Job Card"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={submitting} disabled={!serviceId}>Add</Button>
        </>
      }
    >
      <Field label="Service" required>
        <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          <option value="">Select service...</option>
          {available.map((s) => (
            <option key={s.id} value={s.id}>{s.service_name} — ₹{s.service_price}</option>
          ))}
        </Select>
      </Field>
      {available.length === 0 && (
        <p className="text-xs text-gray-500 mt-3">All services have already been added.</p>
      )}
    </Modal>
  );
}

/* ─── Comprehensive Payment Bill (ALL instalments) ──────────────────────── */
function buildComprehensiveBillHTML({ payments, jobCard, totalAmount }) {
  const fmt = (n) =>
    `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  const METHOD = {
    cash: 'Cash', upi: 'UPI', card: 'Card',
    netbanking: 'Net Banking', cheque: 'Cheque', other: 'Other',
  };

  const total    = Number(totalAmount || 0);
  const paidAmt  = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const balAmt   = Math.max(0, total - paidAmt);
  const fullyPaid = balAmt <= 0;
  const billNo   = `BILL-${jobCard.job_card_number || jobCard.id}`;
  const genDate  = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const serviceRows = (jobCard.job_card_services || []).map(s => `
    <tr>
      <td style="padding:9px 14px;border-bottom:1px solid #1f2431">${s.service_name || s.service || '—'}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #1f2431;text-align:right;font-weight:600">${fmt(s.price_at_time)}</td>
    </tr>`).join('');

  /* Running balance per instalment */
  let runningPaid = 0;
  const instRows = payments.map((p, i) => {
    runningPaid += Number(p.amount || 0);
    const bal = Math.max(0, total - runningPaid);
    return `<tr>
      <td style="padding:9px 14px;border-bottom:1px solid #1f2431;color:#9ca3af;text-align:center">${i + 1}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #1f2431;color:#e5e7eb">${p.payment_date}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #1f2431;color:#9ca3af">${METHOD[p.payment_method] || p.payment_method}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #1f2431;text-align:right;color:#34d399;font-weight:700">${fmt(p.amount)}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #1f2431;text-align:right;color:${bal <= 0 ? '#34d399' : '#fbbf24'}">${fmt(bal)}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #1f2431;color:#6b7280;font-size:11px">${p.notes || '—'}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Payment Bill — ${billNo}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#0b0d12;color:#e5e7eb;padding:32px}
.page{max-width:820px;margin:0 auto}
.card{background:#13161d;border:1px solid #252a36;border-radius:12px;padding:22px 26px;margin-bottom:18px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}
.lbl{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px}
.val{font-size:14px;color:#e5e7eb;font-weight:600}
.kpi{background:#1a1e27;border:1px solid #252a36;border-radius:10px;padding:14px 16px}
.kpi .amount{font-size:22px;font-weight:800;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{padding:9px 14px;color:#6b7280;font-weight:500;text-align:left;border-bottom:1px solid #252a36;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
.chip{display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700}
.section-title{font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px}
@media print{body{background:#fff;color:#111}.card,.kpi{background:#fff;border-color:#e5e7eb}}
</style>
</head>
<body>
<div class="page">

  <!-- ① Header -->
  <div class="card" style="background:linear-gradient(135deg,#1a1e27,#0f1117);margin-bottom:22px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-.3px">🚗 Detailing Workshop</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px">Payment Bill — All Instalments</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:14px;color:#a78bfa;font-weight:800">${billNo}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:3px">Generated: ${genDate}</div>
        <div style="margin-top:10px">
          <span class="chip" style="background:${fullyPaid ? '#052e16' : '#2d1a07'};color:${fullyPaid ? '#34d399' : '#fbbf24'};border:1px solid ${fullyPaid ? '#15803d66' : '#a1620766'}">
            ${fullyPaid ? '✓ FULLY PAID' : `⚡ ${payments.length} INSTALMENT${payments.length > 1 ? 'S' : ''} PAID`}
          </span>
        </div>
      </div>
    </div>
  </div>

  <!-- ② KPI row -->
  <div class="grid4">
    <div class="kpi"><div class="lbl">Total Billed</div><div class="amount" style="color:#c4b5fd">${fmt(total)}</div></div>
    <div class="kpi"><div class="lbl">Total Paid</div><div class="amount" style="color:#34d399">${fmt(paidAmt)}</div></div>
    <div class="kpi"><div class="lbl">Outstanding</div><div class="amount" style="color:${fullyPaid ? '#34d399' : '#fbbf24'}">${fmt(balAmt)}</div></div>
    <div class="kpi"><div class="lbl">Instalments</div><div class="amount" style="color:#38bdf8">${payments.length}</div></div>
  </div>

  <!-- ③ Customer & Vehicle -->
  <div class="card">
    <div class="section-title">Job Card Details</div>
    <div class="grid2">
      <div><div class="lbl">Customer Name</div><div class="val">${jobCard.customer_name || '—'}</div></div>
      <div><div class="lbl">Vehicle Number</div><div class="val">${jobCard.vehicle_number || '—'}</div></div>
      <div style="margin-top:14px"><div class="lbl">Job Card #</div><div class="val">${jobCard.job_card_number || '—'}</div></div>
      <div style="margin-top:14px"><div class="lbl">Job Card Date</div><div class="val">${jobCard.job_card_date || '—'}</div></div>
    </div>
  </div>

  <!-- ④ Services -->
  ${serviceRows ? `<div class="card">
    <div class="section-title">Services</div>
    <table>
      <thead><tr>
        <th>Service Name</th>
        <th style="text-align:right">Price</th>
      </tr></thead>
      <tbody>${serviceRows}</tbody>
      <tfoot><tr style="background:#1a1e27">
        <td style="padding:11px 14px;font-weight:800;color:#fff;font-size:14px">TOTAL</td>
        <td style="padding:11px 14px;text-align:right;font-weight:800;color:#c4b5fd;font-size:16px">${fmt(total)}</td>
      </tr></tfoot>
    </table>
  </div>` : ''}

  <!-- ⑤ All Instalments -->
  <div class="card">
    <div class="section-title">Payment Instalments (${payments.length})</div>
    <table>
      <thead><tr>
        <th style="text-align:center">#</th>
        <th>Date</th>
        <th>Method</th>
        <th style="text-align:right">Amount Paid</th>
        <th style="text-align:right">Balance After</th>
        <th>Notes</th>
      </tr></thead>
      <tbody>${instRows}</tbody>
      <tfoot><tr style="background:#1a1e27">
        <td colspan="3" style="padding:11px 14px;font-weight:700;color:#9ca3af">Total Paid</td>
        <td style="padding:11px 14px;text-align:right;color:#34d399;font-weight:800;font-size:15px">${fmt(paidAmt)}</td>
        <td colspan="2" style="padding:11px 14px;text-align:right;color:${fullyPaid ? '#34d399' : '#fbbf24'};font-weight:800;font-size:15px">${fmt(balAmt)} due</td>
      </tr></tfoot>
    </table>
  </div>

  <!-- ⑥ Footer -->
  <div style="text-align:center;color:#374151;font-size:11px;margin-top:24px;padding-top:16px;border-top:1px solid #1a1e27">
    Thank you for your business &nbsp;·&nbsp; ${billNo} &nbsp;·&nbsp; Detailing CRM
  </div>

</div>
</body>
</html>`;
}

function triggerComprehensiveDownload({ payments, jobCard, totalAmount }) {
  const html = buildComprehensiveBillHTML({ payments, jobCard, totalAmount });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `bill-${(jobCard?.job_card_number || jobCard?.id || 'jc').replace(/\s+/g, '-')}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ─── helpers ──────────────────────────────────────────────────────────────── */
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtMoney = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const METHOD_LABEL = {
  cash: 'Cash', upi: 'UPI', card: 'Card',
  netbanking: 'Net Banking', cheque: 'Cheque', other: 'Other',
};

export function AddPaymentModal({ open, onClose, jobCardId, onAdded, outstanding, totalAmount, jobCard }) {
  const toast = useToast();

  const [form, setForm]             = useState({ amount: '', payment_date: localToday(), payment_method: 'cash', notes: '' });
  const [submitting, setSubmitting]  = useState(false);
  const [payments, setPayments]     = useState([]);
  const [loadingPay, setLoadingPay] = useState(false);
  const [justRecordedId, setJustRecordedId] = useState(null);
  const [showDownloadBtn, setShowDownloadBtn] = useState(false);

  /* Fetch fresh payment list every time the modal opens */
  useEffect(() => {
    if (!open || !jobCardId) return;
    setForm({ amount: '', payment_date: localToday(), payment_method: 'cash', notes: '' });
    setJustRecordedId(null);
    setShowDownloadBtn(false);
    setLoadingPay(true);
    listJobCardPayments(jobCardId)
      .then(data => setPayments(Array.isArray(data) ? data : []))
      .catch(() => setPayments([]))
      .finally(() => setLoadingPay(false));
  }, [open, jobCardId]);

  /* Live-compute totals from fetched payments */
  const total     = Number(totalAmount || 0);
  const paidAmt   = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const dueAmt    = Math.max(0, total - paidAmt);
  const payStatus = total <= 0 ? 'unpaid'
    : paidAmt >= total ? 'paid'
    : paidAmt > 0      ? 'partial'
    : 'unpaid';

  const STATUS_CFG = {
    paid:    { bg: 'bg-emerald-900/30', border: 'border-emerald-700/50', text: 'text-emerald-300', label: '✓ Fully Paid' },
    partial: { bg: 'bg-yellow-900/25',  border: 'border-yellow-700/50',  text: 'text-yellow-300',  label: '⚡ Partially Paid' },
    unpaid:  { bg: 'bg-red-900/20',     border: 'border-red-700/50',     text: 'text-red-300',     label: '✗ Unpaid' },
  };
  const scfg = STATUS_CFG[payStatus];

  const submit = async (e) => {
    e.preventDefault();
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setSubmitting(true);
    try {
      const newPay = await addJobCardPayment(jobCardId, {
        amount:         Number(form.amount),
        payment_date:   form.payment_date,
        payment_method: form.payment_method,
        notes:          form.notes,
      });
      const updatedPayments = [...payments, newPay];
      setPayments(updatedPayments);
      setJustRecordedId(newPay.id ?? (updatedPayments.length - 1));
      setShowDownloadBtn(true);
      setForm({ amount: '', payment_date: localToday(), payment_method: 'cash', notes: '' });
      toast.success('Payment recorded');
      onAdded();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record Payment"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {(showDownloadBtn || payStatus === 'paid') && payments.length > 0 && jobCard && (
            <Button
              variant="secondary"
              onClick={() => triggerComprehensiveDownload({ payments, jobCard, totalAmount: total })}
            >
              <Download size={14} /> Download Bill
            </Button>
          )}
          {payStatus !== 'paid' && (
            <Button variant="success" onClick={submit} loading={submitting}>Record Payment</Button>
          )}
        </>
      }
    >
      <div className="space-y-4">

        {/* ── Status & amount summary ── */}
        {total > 0 && (
          <div className={`rounded-xl border px-4 py-3 ${scfg.bg} ${scfg.border}`}>
            <div className={`text-xs font-bold mb-2 ${scfg.text}`}>{scfg.label}</div>
            <div className="grid grid-cols-3 gap-3 text-[11px]">
              <div>
                <span className="text-gray-500 block mb-0.5">Total Billed</span>
                <span className="text-gray-200 font-semibold">{fmtMoney(total)}</span>
              </div>
              <div>
                <span className="text-gray-500 block mb-0.5">Paid</span>
                <span className="text-emerald-400 font-semibold">{fmtMoney(paidAmt)}</span>
              </div>
              <div>
                <span className="text-gray-500 block mb-0.5">Outstanding</span>
                <span className="text-yellow-400 font-semibold">{fmtMoney(dueAmt)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Payment installments history ── */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-3 py-2 bg-bg-elev border-b border-border flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Payment Installments
            </span>
            {payments.length > 0 && (
              <span className="text-[10px] bg-bg px-1.5 py-0.5 rounded-full border border-border text-gray-400">
                {payments.length}
              </span>
            )}
          </div>

          {loadingPay ? (
            <div className="px-3 py-4 text-xs text-gray-500 text-center">Loading…</div>
          ) : payments.length === 0 ? (
            <div className="px-3 py-4 text-xs text-gray-500 text-center">No payments recorded yet</div>
          ) : (
            <div className="divide-y divide-border max-h-52 overflow-y-auto">
              {payments.map((p, i) => {
                const isNew = p.id != null ? p.id === justRecordedId : i === justRecordedId;
                return (
                  <div
                    key={p.id ?? i}
                    className={`flex items-center justify-between px-3 py-2.5 transition-colors ${isNew ? 'bg-emerald-900/20' : 'hover:bg-bg-hover'}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Installment number bubble */}
                      <span className="w-6 h-6 rounded-full bg-emerald-900/40 border border-emerald-700/40 text-emerald-400 text-[9px] font-bold flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs text-gray-200 font-medium flex items-center gap-1.5">
                          {p.payment_date}
                          {isNew && (
                            <span className="text-[9px] bg-emerald-900/50 text-emerald-300 border border-emerald-700/40 px-1.5 py-0.5 rounded-full">
                              New
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-500">{METHOD_LABEL[p.payment_method] || p.payment_method}</div>
                      </div>
                    </div>

                    {/* Amount */}
                    <span className="text-sm font-bold text-emerald-400 shrink-0">{fmtMoney(p.amount)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Download banner (shown right after recording) ── */}
        {showDownloadBtn && jobCard && payments.length > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-700/50 bg-emerald-900/20 px-4 py-3">
            <div className="text-xs text-emerald-300 font-medium">
              ✓ Payment recorded — bill ready to download
            </div>
            <button
              type="button"
              onClick={() => triggerComprehensiveDownload({ payments, jobCard, totalAmount: total })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-800/50 border border-emerald-600/60 text-emerald-200 text-xs font-semibold hover:bg-emerald-700/50 transition-colors"
            >
              <Download size={12} /> Download Bill
            </button>
          </div>
        )}

        {/* ── New payment form (hidden when fully paid) ── */}
        {payStatus !== 'paid' && (
          <>
            <div className="border-t border-border" />
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider -mb-1">Add New Payment</p>

            <Field label="Amount (₹)" required>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder={dueAmt > 0 ? `Outstanding: ₹${dueAmt.toLocaleString('en-IN')}` : 'Enter amount'}
                value={form.amount}
                onChange={e => upd('amount', e.target.value)}
              />
            </Field>
            <Field label="Payment Date" required>
              <Input type="date" value={form.payment_date} onChange={e => upd('payment_date', e.target.value)} />
            </Field>
            <Field label="Payment Method">
              <Select value={form.payment_method} onChange={e => upd('payment_method', e.target.value)}>
                {[['cash','Cash'],['upi','UPI'],['card','Card'],['netbanking','Net Banking'],['cheque','Cheque'],['other','Other']].map(([v,l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </Field>
            <Field label="Notes">
              <Input placeholder="Optional note" value={form.notes} onChange={e => upd('notes', e.target.value)} />
            </Field>
          </>
        )}

        {/* Fully paid message */}
        {payStatus === 'paid' && (
          <p className="text-xs text-emerald-400 text-center py-2">
            🎉 This job card is fully paid. Click "Download Bill" to get a full statement.
          </p>
        )}

      </div>
    </Modal>
  );
}

function AssignEmployeeModal({ serviceLinkId, onClose, employees, onAdded }) {
  const toast = useToast();
  const [empId, setEmpId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const open = !!serviceLinkId;

  useEffect(() => { if (open) setEmpId(''); }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!empId) return;
    setSubmitting(true);
    try {
      await addJobCardServiceEmployee(serviceLinkId, { employee: Number(empId) });
      toast.success('Employee assigned');
      onAdded();
      onClose();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign Employee"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={submitting} disabled={!empId}>Assign</Button>
        </>
      }
    >
      <Field label="Employee" required>
        <Select value={empId} onChange={(e) => setEmpId(e.target.value)}>
          <option value="">Select employee...</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>{emp.employee_name}</option>
          ))}
        </Select>
      </Field>
    </Modal>
  );
}

export function ShowProductsUsedDialog({ open, onClose, jobCardId, onConfirm, confirming, serviceId = null }) {
  const [productsUsed, setProductsUsed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeProduct, setActiveProduct] = useState(null);
  const toast = useToast();

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await loadProductsUsedForJobCard(jobCardId);
      const fresh = Array.isArray(res) ? res : [];
      setProductsUsed(fresh);
      setActiveProduct((prev) => {
        if (!prev) return prev;
        for (const svc of fresh) {
          for (const p of svc.products || []) {
            if (p.id === prev.id) return p;
          }
        }
        return prev;
      });
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !jobCardId) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, jobCardId]);

  const displayServices = serviceId
    ? productsUsed.filter((s) => s.id === serviceId)
    : productsUsed;
  const scoped = serviceId !== null;
  const titleSvc = displayServices[0]?.service_name;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={scoped ? `Record Usage — ${titleSvc || ''}` : 'Products Used in This Job Card'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>{scoped ? 'Done' : 'Cancel'}</Button>
            {!scoped && onConfirm && (
              <Button variant="success" onClick={onConfirm} loading={confirming}>
                Confirm & Mark Completed
              </Button>
            )}
          </>
        }
      >
        {loading ? (
          <Loading />
        ) : displayServices.length === 0 ? (
          <p className="text-sm text-gray-500">
            {scoped ? 'This service has no linked products.' : 'No products linked to the services on this job card.'}
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">Click a product to record what you used.</p>
            {displayServices.map((svc) => (
              <div key={svc.id} className="bg-bg-elev border border-border rounded-lg p-4">
                <div className="text-sm font-semibold text-gray-100 mb-2">{svc.service_name}</div>
                {(svc.products || []).length === 0 ? (
                  <div className="text-xs text-gray-500">No products linked.</div>
                ) : (
                  <ul className="space-y-1.5">
                    {svc.products.map((p) => {
                      const hasUsages = (p.usages || []).length > 0;
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => setActiveProduct(p)}
                            className="w-full text-left text-sm px-2 py-1.5 rounded-md hover:bg-bg-hover transition-colors flex items-center justify-between gap-2"
                          >
                            <span className="text-gray-200">{p.product_name}</span>
                            <span className={`text-xs ${hasUsages ? 'text-emerald-400' : 'text-gray-500'}`}>
                              {hasUsages ? `${p.usages.length} recorded` : 'Not recorded'}
                            </span>
                          </button>
                          {hasUsages && (
                            <ul className="ml-4 mt-1 space-y-0.5">
                              {p.usages.map((u) => (
                                <li key={u.id} className="text-xs text-gray-400">
                                  • {u.brand ? `${u.brand} — ` : ''}{u.unit_amount} {u.unit_label} × {u.quantity_used}
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ProductUsageModal
        product={activeProduct}
        onClose={() => setActiveProduct(null)}
        onChanged={loadData}
      />
    </>
  );
}

function ProductUsageModal({ product, onClose, onChanged }) {
  const toast = useToast();
  const [options, setOptions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [inventoryId, setInventoryId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const open = !!product;

  useEffect(() => {
    if (!open) return;
    setInventoryId('');
    setQuantity('');
    setLoadingOptions(true);
    listInventoryOptions(product.id)
      .then((res) => setOptions(Array.isArray(res) ? res : []))
      .catch((err) => toast.error(extractError(err)))
      .finally(() => setLoadingOptions(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id]);

  const submit = async () => {
    if (!inventoryId) { toast.error('Pick an inventory item'); return; }
    if (!quantity || isNaN(Number(quantity)) || Number(quantity) <= 0) {
      toast.error('Enter a valid quantity'); return;
    }
    setSubmitting(true);
    try {
      await addJobCardProductUsage(product.id, {
        inventory_id: Number(inventoryId),
        quantity_used: Number(quantity),
      });
      toast.success('Usage recorded');
      setInventoryId('');
      setQuantity('');
      onChanged?.();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const removeUsage = async (usageId) => {
    try {
      await removeJobCardProductUsage(usageId);
      toast.success('Usage removed');
      onChanged?.();
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? `Record usage — ${product.product_name}` : 'Record usage'}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Done</Button>
          <Button onClick={submit} loading={submitting} disabled={!inventoryId || !quantity}>Add</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Which bottle/pack did you use?" required>
          {loadingOptions ? (
            <Loading />
          ) : options.length === 0 ? (
            <p className="text-xs text-gray-500">No inventory rows exist for this product yet.</p>
          ) : (
            <Select value={inventoryId} onChange={(e) => setInventoryId(e.target.value)}>
              <option value="">Select inventory item...</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {(o.brand ? `${o.brand} — ` : '')}
                  {o.unit_amount} {o.unit_label}
                  {`  (${o.quantity_available} in stock)`}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Quantity used" required>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            placeholder="e.g. 1 (full) or 0.5 (half)"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <p className="text-xs text-gray-500 mt-1">1 = a whole unit, 0.5 = half a unit.</p>
        </Field>

        {product && (product.usages || []).length > 0 && (
          <div className="border-t border-border pt-3">
            <p className="text-xs text-gray-500 font-medium mb-2">Already recorded</p>
            <ul className="space-y-1">
              {product.usages.map((u) => (
                <li key={u.id} className="flex items-center justify-between text-xs text-gray-300">
                  <span>
                    {u.brand ? `${u.brand} — ` : ''}{u.unit_amount} {u.unit_label} × {u.quantity_used}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeUsage(u.id)}
                    className="text-gray-500 hover:text-red-400"
                    title="Remove"
                  >
                    <Trash2 size={11} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}