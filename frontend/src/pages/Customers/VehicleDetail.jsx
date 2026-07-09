import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Car, User, ClipboardList, Calendar, AlertTriangle } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Loading from '../../components/Loading';
import Badge from '../../components/Badge';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import { Field, Input } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { getAsset, changeCustomer, checkCustomer } from '../../api/customers';
import { CustomerFormModal } from './index';
const PAY_CFG = {
  paid: { label: 'Paid', cls: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50' },
  partial: { label: 'Partial', cls: 'bg-yellow-900/30 text-yellow-300 border-yellow-700/50' },
  unpaid: { label: 'Unpaid', cls: 'bg-red-900/30 text-red-300 border-red-700/50' },
};
import { listJobCards } from '../../api/jobcards';
import { extractError } from '../../api/axios';

const fmtDate = (s) => {
  if (!s) return '—';
  return new Date(s + 'T00:00:00').toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const addMonths = (dateStr, n) => {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
};

const VTYPE_LABEL = {
  two_wheeler: 'Two Wheeler',
  three_wheeler: 'Three Wheeler',
  four_wheeler: 'Four Wheeler',
  other: 'Other',
};

function Row({ label, value, highlight }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border last:border-0">
      <dt className="text-xs text-gray-500 shrink-0 w-36">{label}</dt>
      <dd className={`text-sm text-right font-medium ${highlight || 'text-gray-200'}`}>{value}</dd>
    </div>
  );
}

export default function VehicleDetail() {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [vehicle, setVehicle] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [changeCustomerModalOpen, setChangeCustomerModalOpen] = useState(false);
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [v, j] = await Promise.all([
          getAsset(vehicleId),
          listJobCards({ vehicle_id: vehicleId }),
        ]);
        setVehicle(v);
        setJobs(Array.isArray(j) ? j : (j.results || []));
      } catch (err) {
        toast.error(extractError(err));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [vehicleId]); // eslint-disable-line

  // Lightweight refetch (no full-page loading flash) — used after changing the owner
  const refetchVehicle = async () => {
    try {
      const v = await getAsset(vehicleId);
      setVehicle(v);
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  if (loading) return <Loading />;
  if (!vehicle) return <div className="text-gray-400 p-4">Vehicle not found</div>;

  const nextServiceDate = vehicle.next_service_date || addMonths(vehicle.last_service_date, 6);
  const isOverdue = nextServiceDate && new Date(nextServiceDate) < new Date();
  const daysUntil = nextServiceDate
    ? Math.round((new Date(nextServiceDate) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  const vehicleLabel = [vehicle.vehicle_company, vehicle.vehicle_model, vehicle.vehicle_colour]
    .filter(Boolean).join(' · ') || vehicle.vehicle_name || vehicle.vehicle_number;

  return (
    <div>
      <PageHeader
        title={vehicle.vehicle_number}
        subtitle={vehicleLabel}
        breadcrumbs={
          <Link to="/customers?tab=vehicles" onClick={(e) => { e.preventDefault(); navigate('/customers'); }}
            className="hover:text-gray-300 inline-flex items-center gap-1">
            <ChevronLeft size={12} /> Back to Customers / Vehicles
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">

        {/* ── Left: Customer + Vehicle details ── */}
        <div className="space-y-4">

          {/* Service date card */}
          <div className={`rounded-xl border p-4 flex items-start gap-3 ${isOverdue
            ? 'bg-red-900/20 border-red-700/50'
            : nextServiceDate
              ? 'bg-emerald-900/15 border-emerald-700/40'
              : 'bg-bg-card border-border'
            }`}>
            <div className={`mt-0.5 ${isOverdue ? 'text-red-400' : 'text-emerald-400'}`}>
              {isOverdue ? <AlertTriangle size={18} /> : <Calendar size={18} />}
            </div>
            <div className="min-w-0">
              <div className={`text-sm font-semibold ${isOverdue ? 'text-red-300' : 'text-emerald-300'}`}>
                {isOverdue ? 'Service Overdue' : nextServiceDate ? 'Service Upcoming' : 'No Service Scheduled'}
              </div>
              {nextServiceDate && (
                <div className="text-xs text-gray-400 mt-0.5">
                  Next service: <span className="font-medium text-gray-200">{fmtDate(nextServiceDate)}</span>
                  {daysUntil !== null && (
                    <span className={`ml-2 ${isOverdue ? 'text-red-400' : 'text-gray-400'}`}>
                      ({isOverdue ? `${Math.abs(daysUntil)} days overdue` : `in ${daysUntil} days`})
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Customer card */}
          <div className="bg-bg-card border border-border rounded-xl">
            <div className="px-5 py-3 border-b border-border flex items-center gap-2">
              <User size={15} className="text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-100">Customer</h2>
              <button className="ml-auto text-xs text-accent hover:text-accent/80" onClick={() => setChangeCustomerModalOpen(true)}>
                Change Customer
              </button>
            </div>
            <dl className="px-5 py-3">
              <Row label="Name" value={vehicle.customer_name || '—'} />
              {vehicle.customer_phone_number && (
                <Row label="Phone" value={vehicle.customer_phone_number} />
              )}
            </dl>
          </div>

          {changeCustomerModalOpen && (
            <ChangeCustomerModal
              vehicle={vehicle}
              onClose={() => setChangeCustomerModalOpen(false)}
              onChanged={refetchVehicle}
            />
          )}


          {/* Vehicle details card */}
          <div className="bg-bg-card border border-border rounded-xl">
            <div className="px-5 py-3 border-b border-border flex items-center gap-2">
              <Car size={15} className="text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-100">Vehicle Details</h2>
            </div>
            <dl className="px-5 py-3">
              <Row label="Vehicle Number" value={vehicle.vehicle_number} />
              <Row label="Type" value={VTYPE_LABEL[vehicle.vehicle_type] || vehicle.vehicle_type || '—'} />
              {vehicle.vehicle_company && <Row label="Company / Make" value={vehicle.vehicle_company} />}
              {vehicle.vehicle_model && <Row label="Model" value={vehicle.vehicle_model} />}
              {vehicle.vehicle_colour && <Row label="Colour" value={vehicle.vehicle_colour} />}
              <Row label="Last Service" value={fmtDate(vehicle.last_service_date)} />
              <Row
                label="Next Service"
                value={fmtDate(nextServiceDate)}
                highlight={isOverdue ? 'text-red-400' : nextServiceDate ? 'text-emerald-400' : undefined}
              />
            </dl>
          </div>
        </div>

        {/* ── Right: Job card history ── */}
        <div className="bg-bg-card border border-border rounded-xl">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-100 flex items-center gap-2">
              <ClipboardList size={15} /> Job Card History
              <span className="text-xs text-gray-500 font-normal">({jobs.length})</span>
            </h2>
          </div>

          {jobs.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-500">No job cards for this vehicle</div>
          ) : (
            <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
              {jobs.map((j) => {
                const total = Number(j.total_amount || 0);
                const paid = Number(j.paid_amount || 0);
                const due = total - paid;
                return (
                  <Link
                    key={j.id}
                    to={`/jobcards/${j.id}`}
                    className="block px-5 py-3.5 hover:bg-bg-hover transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-100 text-sm">{j.job_card_number}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{fmtDate(j.job_card_date)}</div>
                        {j.employee_name && (
                          <div className="text-xs text-gray-500 mt-0.5">Employee: {j.employee_name}</div>
                        )}
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        <Badge variant={j.job_card_status === 'COMPLETED' ? 'green' : 'yellow'}>
                          {j.job_card_status === 'COMPLETED' ? 'Completed' : 'In Progress'}
                        </Badge>
                        {(() => {
                          const pay = j.payment_status || 'unpaid';
                          const cfg = PAY_CFG[pay] || PAY_CFG.unpaid;
                          return (
                            <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.cls}`}>
                              {cfg.label}
                            </span>
                          );
                        })()}
                        <div className="text-xs text-gray-300 font-medium">
                          ₹{total.toLocaleString('en-IN')}
                        </div>
                        {due > 0 && (
                          <div className="text-xs text-yellow-400">
                            ₹{due.toLocaleString('en-IN', { minimumFractionDigits: 2 })} due
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

const ChangeCustomerModal = ({ vehicle, onClose, onChanged }) => {
  const toast = useToast();
  const [phone, setPhone] = useState('');
  // lookup: null (not searched yet) | { status: 'found', customer } | { status: 'not_found' }
  const [lookup, setLookup] = useState(null);
  const [looking, setLooking] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [createModal, setCreateModal] = useState(null); // null | { mode: 'create' }

  const handleLookup = async () => {
    const value = phone.trim();
    if (!value) return;
    setLooking(true);
    setLookup(null);
    try {
      const res = await checkCustomer(value);
      setLookup(res.exists ? { status: 'found', customer: res.customer } : { status: 'not_found' });
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLooking(false);
    }
  };

  // Assign an existing customer (by id) as this vehicle's owner
  const assign = async (customerId) => {
    setAssigning(true);
    try {
      await changeCustomer(vehicle.vehicle_number, customerId);
      toast.success('Vehicle owner updated');
      await onChanged?.();
      onClose();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setAssigning(false);
    }
  };

  // Called after CustomerFormModal creates a new customer → auto-assign them
  const handleCreated = async (created) => {
    if (created?.id) await assign(created.id);
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="Change Vehicle Owner"
        footer={<Button variant="secondary" onClick={onClose}>Cancel</Button>}
      >
        <div className="space-y-4">
          <Field label="Customer Phone Number">
            <div className="flex gap-2">
              <Input
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setLookup(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleLookup(); } }}
                placeholder="Enter customer phone number"
                autoFocus
              />
              <Button onClick={handleLookup} loading={looking} disabled={!phone.trim()}>
                Lookup
              </Button>
            </div>
          </Field>

          {lookup?.status === 'found' && (
            <div className="rounded-lg border border-emerald-700/40 bg-emerald-900/15 p-4">
              <div className="text-xs font-medium text-emerald-300 mb-2">Customer found</div>
              <div className="text-sm text-gray-100 font-semibold">
                {lookup.customer.customer_name || 'Unknown Member'}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{lookup.customer.phone_number}</div>
              {lookup.customer.email && (
                <div className="text-xs text-gray-500 mt-0.5">{lookup.customer.email}</div>
              )}
              <Button
                className="mt-3 w-full sm:w-auto"
                onClick={() => assign(lookup.customer.id)}
                loading={assigning}
              >
                Set as owner
              </Button>
            </div>
          )}

          {lookup?.status === 'not_found' && (
            <div className="rounded-lg border border-border bg-bg-elev p-4">
              <div className="text-sm text-gray-300">
                No customer found with <span className="font-medium text-gray-100">{phone.trim()}</span>.
              </div>
              <div className="text-xs text-gray-500 mt-1">Create a new customer and assign them to this vehicle.</div>
              <Button
                className="mt-3 w-full sm:w-auto"
                onClick={() => setCreateModal({ mode: 'create', data: { phone_number: phone.trim() } })}
              >
                Create New Customer
              </Button>
            </div>
          )}

          {!lookup && !looking && (
            <p className="text-xs text-gray-500">
              Enter the new owner's phone number and press Lookup.
            </p>
          )}
        </div>
      </Modal>

      <CustomerFormModal
        modal={createModal}
        onClose={() => setCreateModal(null)}
        onSaved={handleCreated}
      />
    </>
  );
};