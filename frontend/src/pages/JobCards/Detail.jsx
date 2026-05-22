import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, CheckCircle2, Plus, Trash2, UserPlus, Wrench, IndianRupee, Trash, CreditCard } from 'lucide-react';
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
              <Button variant="success" onClick={markCompleted} loading={completing}>
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

function AddPaymentModal({ open, onClose, jobCardId, onAdded, outstanding }) {
  const toast = useToast();
  const [form, setForm] = useState({ amount: '', payment_date: new Date().toISOString().slice(0, 10), payment_method: 'cash', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setForm({ amount: '', payment_date: new Date().toISOString().slice(0, 10), payment_method: 'cash', notes: '' });
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setSubmitting(true);
    try {
      await addJobCardPayment(jobCardId, {
        amount: Number(form.amount),
        payment_date: form.payment_date,
        payment_method: form.payment_method,
        notes: form.notes,
      });
      toast.success('Payment recorded');
      onAdded();
      onClose();
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
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="success" onClick={submit} loading={submitting}>Record</Button>
        </>
      }
    >
      <div className="space-y-4">
        {outstanding && Number(outstanding) > 0 && (
          <p className="text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-800 rounded-md px-3 py-2">
            Outstanding: ₹{Number(outstanding).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
        )}
        <Field label="Amount (₹)" required>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Enter amount"
            value={form.amount}
            onChange={e => upd('amount', e.target.value)}
          />
        </Field>
        <Field label="Payment Date" required>
          <Input type="date" value={form.payment_date} onChange={e => upd('payment_date', e.target.value)} />
        </Field>
        <Field label="Payment Method">
          <Select value={form.payment_method} onChange={e => upd('payment_method', e.target.value)}>
            {[['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card'], ['netbanking', 'Net Banking'], ['cheque', 'Cheque'], ['other', 'Other']].map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="Notes">
          <Input placeholder="Optional note" value={form.notes} onChange={e => upd('notes', e.target.value)} />
        </Field>
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
