import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, Plus, Car, Pencil, Trash2, ClipboardList } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import Badge from '../../components/Badge';
import Modal from '../../components/Modal';
import { Select } from '../../components/Field';
import ConfirmDialog from '../../components/ConfirmDialog';
import { Field, Input } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { getCustomer, addCustomerAsset, updateAsset, deleteAsset } from '../../api/customers';
import { listJobCards } from '../../api/jobcards';
const fmtAmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const PAY_CFG = {
  paid: { label: 'Paid', cls: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50' },
  partial: { label: 'Partial', cls: 'bg-yellow-900/30 text-yellow-300 border-yellow-700/50' },
  unpaid: { label: 'Unpaid', cls: 'bg-red-900/30 text-red-300 border-red-700/50' },
};
import { extractError } from '../../api/axios';

export default function CustomerDetail() {
  const { id } = useParams();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [vehicleModal, setVehicleModal] = useState(null); // null | { mode, data }
  const [confirmDel, setConfirmDel] = useState(null);
  const [vehicleType, setVehicleType] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [c, j] = await Promise.all([getCustomer(id), listJobCards()]);
      setCustomer(c);
      const arr = Array.isArray(j) ? j : (j.results || []);
      const customerVehicleIds = (c.vehicles || []).map((v) => v.id);
      // setJobs(arr.filter((job) => customerVehicleIds.includes(job.customer_asset)));
      setJobs(arr.filter((job) => job.customer_id === c.id));
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const onDeleteVehicle = async () => {
    if (!confirmDel) return;
    try {
      await deleteAsset(confirmDel.id);
      toast.success('Vehicle removed');
      setConfirmDel(null);
      load();
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  if (loading) return <Loading />;
  if (!customer) return <div className="text-gray-400">Customer not found</div>;

  return (
    <div>
      <PageHeader
        title={customer.customer_name}
        subtitle={`${customer.phone_number}${customer.email ? ' · ' + customer.email : ''}`}
        breadcrumbs={
          <Link to="/customers" className="hover:text-gray-300 inline-flex items-center gap-1">
            <ChevronLeft size={12} /> Back to Customers
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-bg-card border border-border rounded-xl">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-100 flex items-center gap-2">
              <Car size={16} /> Vehicles
            </h2>
            <Button size="sm" onClick={() => setVehicleModal({ mode: 'create' })}>
              <Plus size={14} /> Add Vehicle
            </Button>
          </div>
          {(customer.vehicles || []).length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-500">No vehicles registered</div>
          ) : (
            <div className="divide-y divide-border">
              {customer.vehicles.map((v) => (
                <div key={v.id} className="px-4 sm:px-5 py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-100 truncate">{v.vehicle_number}</div>
                    <div className="text-xs text-gray-400 truncate">{v.vehicle_name || [v.vehicle_company, v.vehicle_model].filter(Boolean).join(' ')}</div>
                    <div className="text-xs text-gray-500">{v.vehicle_type?.replace('_', ' ')}</div>
                  </div>
                  <div className="text-xs text-gray-400 shrink-0 hidden sm:block">{v.last_service_date || '—'}</div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setVehicleModal({ mode: 'edit', data: v })} className="p-1.5 text-gray-400 hover:text-accent">
                      <Pencil size={14} />
                    </button>
                    {/* <button onClick={() => setConfirmDel(v)} className="p-1.5 text-gray-400 hover:text-red-400">
                      <Trash2 size={14} />
                    </button> */}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-bg-card border border-border rounded-xl">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-base font-semibold text-gray-100 flex items-center gap-2">
              <ClipboardList size={16} /> Job Card History
            </h2>
          </div>
          {jobs.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-500">No job cards for this customer</div>
          ) : (
            <div className="divide-y divide-border max-h-[480px] overflow-y-auto">
              {jobs.map((j) => (
                <Link
                  to={`/jobcards/${j.id}`}
                  key={j.id}
                  className="block px-5 py-3 hover:bg-bg-hover transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-100 text-sm truncate">{j.job_card_number}</div>
                      <div className="text-xs text-gray-400">{j.vehicle_number} · {j.job_card_date}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant={j.job_card_status === 'COMPLETED' ? 'green' : 'yellow'}>
                        {j.job_card_status === 'COMPLETED' ? 'Completed' : 'In Progress'}
                      </Badge>
                      {(() => {
                        const pay = j.payment_status || 'unpaid';
                        const cfg = PAY_CFG[pay] || PAY_CFG.unpaid;
                        const total = Number(j.total_amount || 0);
                        const due = Number(j.outstanding || 0);
                        return (
                          <>
                            <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.cls}`}>
                              {cfg.label}
                            </span>
                            <span className="text-[11px] text-gray-300 font-medium">{fmtAmt(total)}</span>
                            {due > 0 && <span className="text-[10px] text-yellow-400">{fmtAmt(due)} due</span>}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <VehicleModal
        modal={vehicleModal}
        onClose={() => setVehicleModal(null)}
        onSaved={load}
        customerId={id}
      />

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={onDeleteVehicle}
        title="Remove this vehicle?"
        message="The vehicle will be removed from this customer."
      />
    </div>
  );
}

function VehicleModal({ modal, onClose, onSaved, customerId }) {
  const toast = useToast();
  const [form, setForm] = useState({ vehicle_number: '', vehicle_name: '', vehicle_type: '', vehicle_subtype: '', vehicle_company: '', vehicle_model: '', vehicle_colour: '' });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [vehicleType, setVehicleType] = useState('');
  useEffect(() => {
    if (!modal) return;
    if (modal.mode === 'edit') {
      setForm({
        vehicle_number: modal.data.vehicle_number || '',
        vehicle_name: modal.data.vehicle_name || '',
        vehicle_type: modal.data.vehicle_type || '',
        vehicle_subtype: modal.data.vehicle_subtype || '',
        vehicle_company: modal.data.vehicle_company || '',
        vehicle_model: modal.data.vehicle_model || '',
        vehicle_colour: modal.data.vehicle_colour || '',
      });
    } else {
      setForm({ vehicle_number: '', vehicle_name: '', vehicle_type: '', vehicle_subtype: '', vehicle_company: '', vehicle_model: '', vehicle_colour: '' });
    }
    setErrors({});
  }, [modal]);

  const submit = async (e) => {
    e.preventDefault();
    const eMap = {};
    if (!form.vehicle_number.trim()) eMap.vehicle_number = 'Required';
    if (!form.vehicle_name.trim()) eMap.vehicle_name = 'Required';
    if (!form.vehicle_type.trim()) eMap.vehicle_type = 'Required';
    setErrors(eMap);
    if (Object.keys(eMap).length) return;
    setSubmitting(true);
    try {
      if (modal.mode === 'edit') {
        await updateAsset(modal.data.id, form);
        toast.success('Vehicle updated');
      } else {
        await addCustomerAsset(customerId, form);
        toast.success('Vehicle added');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={!!modal}
      onClose={onClose}
      title={modal?.mode === 'edit' ? 'Edit Vehicle' : 'Add Vehicle'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={submitting}>{modal?.mode === 'edit' ? 'Save' : 'Add'}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Vehicle Number" required error={errors.vehicle_number}>
          <Input
            placeholder="KA01AB1234"
            value={form.vehicle_number}
            onChange={(e) => setForm({ ...form, vehicle_number: e.target.value })}
          />
        </Field>
        <Field label="Vehicle Name" required error={errors.vehicle_name}>
          <Input
            placeholder="Honda City / Hyundai Creta..."
            value={form.vehicle_name}
            onChange={(e) => setForm({ ...form, vehicle_name: e.target.value })}
          />
        </Field>
        <Field label="Vehicle Type" required error={errors.vehicle_type}>
          <Select value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}>
            <option value="">Select type</option>
            <option value="two_wheeler">Two Wheeler</option>
            <option value="four_wheeler">Four Wheeler</option>
            <option value="three_wheeler">Three Wheeler</option>
          </Select>
        </Field>
        {
          form.vehicle_type === 'four_wheeler' && (
            <Field label="Vehicle Subtype">
              <Select value={form.vehicle_subtype} onChange={(e) => setForm({ ...form, vehicle_subtype: e.target.value })}>
                <option value="hatchback">Hatchback</option>
                <option value="sedan">Sedan</option>
                <option value="suv">SUV</option>
                <option value="compact_suv">Compact SUV</option>
                <option value="four_wheeler_others">Other</option>
              </Select>
            </Field>
          )
        }
        <Field label="Vehicle Company">
          <Input
            placeholder="Honda / Hyundai / Maruti..."
            value={form.vehicle_company}
            onChange={(e) => setForm({ ...form, vehicle_company: e.target.value })}
          />
        </Field>
        < Field label="Vehicle Model">
          <Input
            placeholder="City / Creta / Swift..."
            value={form.vehicle_model}
            onChange={(e) => setForm({ ...form, vehicle_model: e.target.value })}
          />
        </Field>
        <Field label="Vehicle Colour">
          <Input
            placeholder="White / Black / Silver..."
            value={form.vehicle_colour}
            onChange={(e) => setForm({ ...form, vehicle_colour: e.target.value })}
          />
        </Field>
      </form>
    </Modal>
  );
}
