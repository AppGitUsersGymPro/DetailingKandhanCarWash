import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import { Field, Input, Select, Textarea } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { checkVehicle, checkCustomer, listVehicleCompanies, createVehicleCompany, listVehicleModels, createVehicleModel, listVehicleColours, createVehicleColour, listGarageOwners } from '../../api/customers';
import { createFullJobCard, getCustomerTiers } from '../../api/jobcards';
import { listServicesWithVehicleType } from '../../api/services';
import { getSettings } from '../../api/settings';
import { extractError } from '../../api/axios';
import { listEmployees } from '../../api/employees';
import VehicleAutocomplete from '../../components/VehicleAutocomplete';
import { downloadJobCardInvoice } from '../../utils/invoice';
import UpiQr from '../../components/UpiQr';

const nowLocal = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/* Four-wheeler sub-types — all use the four-wheeler image */
const FOUR_WHEELER_SUB_TYPES = [
  { value: 'sedan', label: 'Sedan', description: 'Saloon car' },
  { value: 'compact_suv', label: 'Compact SUV', description: 'Compact SUV' },
  { value: 'suv', label: 'SUV', description: 'Full-size SUV' },
  { value: 'hatchback', label: 'Hatchback', description: 'Hatchback car' },
  { value: 'four_wheeler_others', label: 'Others', description: 'Other 4-wheelers' },
];

/* Vehicle type options — three_wheeler removed */
const VEHICLE_TYPE_OPTIONS = [
  {
    value: 'two_wheeler',
    label: 'Two Wheeler',
    description: 'Bike / Scooter',
    img: '/images/two-wheeler.jpg',
    fallback: '#2d1b69',
    accent: '#a78bfa',
  },
  {
    value: 'four_wheeler',
    label: 'Four Wheeler',
    description: 'Car / SUV',
    img: '/images/four-wheeler.jpg',
    fallback: '#0c4a6e',
    accent: '#38bdf8',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Heavy / Commercial',
    img: '/images/other-vehicle.jpg',
    fallback: '#1a2e05',
    accent: '#86efac',
  },
];

/* ─── Effective pricing type from vehicle info ─────────────────────────── */
function getEffectivePricingType(vehicleType, vehicleSubType) {
  if (vehicleType === 'two_wheeler') return 'two_wheeler';
  if (vehicleType === 'four_wheeler' && vehicleSubType) return vehicleSubType;
  return null;
}

function getServicePrice(service, effectivePricingType) {
  if (effectivePricingType && (service.vehicle_prices || []).length > 0) {
    const vp = service.vehicle_prices.find(p => p.vehicle_type === effectivePricingType);
    if (vp) return Number(vp.price);
  }
  return Number(service.service_price || 0);
}

function filterServicesForVehicle(services, effectivePricingType) {
  if (!effectivePricingType) return services;
  return services.filter(s => {
    const vps = s.vehicle_prices || [];
    if (vps.length === 0) return true;
    return vps.some(vp => vp.vehicle_type === effectivePricingType);
  });
}

/* ─── VehicleTypePicker ───────────────────────────────────────────────────── */
function VehicleTypePicker({ value, onChange, error }) {
  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        {VEHICLE_TYPE_OPTIONS.map((opt) => {
          const selected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`
                relative overflow-hidden rounded-xl border-2 transition-all duration-200 group
                focus:outline-none focus:ring-2 focus:ring-accent/40
                ${selected
                  ? 'border-accent shadow-[0_0_0_1px_rgba(124,92,255,0.4),0_6px_20px_rgba(124,92,255,0.25)] scale-[1.02]'
                  : 'border-border hover:border-gray-500 hover:scale-[1.01]'
                }
              `}
              style={{ aspectRatio: '3/2' }}
            >
              <div className="absolute inset-0" style={{ background: opt.fallback }} />
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                style={{ backgroundImage: `url(${opt.img})` }}
              />
              <div
                className="absolute inset-0"
                style={{
                  background: selected
                    ? `linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.3) 100%)`
                    : `linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.38) 100%)`,
                }}
              />
              {selected && (
                <div
                  className="absolute inset-0 opacity-25"
                  style={{ background: `radial-gradient(ellipse at bottom, ${opt.accent} 0%, transparent 70%)` }}
                />
              )}
              {selected && (
                <div
                  className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: opt.accent }}
                >
                  <Check size={11} className="text-black font-bold" />
                </div>
              )}
              <div className="absolute bottom-0 inset-x-0 p-2.5">
                <div className="text-xs font-bold text-white leading-tight">{opt.label}</div>
                <div className="text-[10px] text-white/60 mt-0.5">{opt.description}</div>
              </div>
            </button>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

/* ─── FourWheelerSubTypePicker ────────────────────────────────────────────── */
function FourWheelerSubTypePicker({ value, onChange, error }) {
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {FOUR_WHEELER_SUB_TYPES.map((opt) => {
          const selected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`
                relative overflow-hidden rounded-xl border-2 transition-all duration-200 group
                focus:outline-none focus:ring-2 focus:ring-accent/40
                ${selected
                  ? 'border-accent shadow-[0_0_0_1px_rgba(124,92,255,0.4),0_6px_20px_rgba(124,92,255,0.25)] scale-[1.02]'
                  : 'border-border hover:border-gray-500 hover:scale-[1.01]'
                }
              `}
              style={{ aspectRatio: '3/2' }}
            >
              <div className="absolute inset-0" style={{ background: '#0c4a6e' }} />
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                style={{ backgroundImage: 'url(/images/four-wheeler.jpg)' }}
              />
              <div
                className="absolute inset-0"
                style={{
                  background: selected
                    ? `linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.3) 100%)`
                    : `linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.38) 100%)`,
                }}
              />
              {selected && (
                <div
                  className="absolute inset-0 opacity-25"
                  style={{ background: 'radial-gradient(ellipse at bottom, #38bdf8 0%, transparent 70%)' }}
                />
              )}
              {selected && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center bg-sky-400">
                  <Check size={11} className="text-black font-bold" />
                </div>
              )}
              <div className="absolute bottom-0 inset-x-0 p-2.5">
                <div className="text-xs font-bold text-white leading-tight">{opt.label}</div>
                <div className="text-[10px] text-white/60 mt-0.5">{opt.description}</div>
              </div>
            </button>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export default function JobCardCreate() {
  const navigate = useNavigate();
  const toast = useToast();

  const [step, setStep] = useState(1);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const [vehicleMatch, setVehicleMatch] = useState(null);
  const [customerMatch, setCustomerMatch] = useState(null);

  /* Owner type: 'customer' | 'garage' */
  const [ownerType, setOwnerType] = useState('customer');
  const [garages, setGarages] = useState([]);
  const [loadingGarages, setLoadingGarages] = useState(false);
  const [selectedGarage, setSelectedGarage] = useState(null);
  const [garageSearch, setGarageSearch] = useState('');

  /* Step 1: basic job card fields only (no phone, no complaints) */
  const [jobCard, setJobCard] = useState({
    job_card_date: new Date().toISOString().slice(0, 10),
    vehicle_number: '',
    vehicle_kilometers: '',
    vehicle_entry_time: nowLocal(),
    vehicle_expected_exit_time: '',
    employee: '',
  });

  /* Step 2: customer + vehicle details (phone moved here) */
  const [customer, setCustomer] = useState({
    customer_name: '',
    phone_number: '',
    email: '',
  });

  const [showPaymentPage, setShowPaymentPage] = useState(false);

  const [paymentType, setPaymentType] = useState('cash');

  const [vehicle, setVehicle] = useState({
    vehicle_name: '',
    vehicle_company: '',
    vehicle_model: '',
    vehicle_colour: '',
    vehicle_type: 'four_wheeler',
  });

  /* Complaints shown in Step 2 (relates to the visit, not just the job card basics) */
  const [complaints, setComplaints] = useState('');

  /* Four-wheeler sub-type (only for new vehicles in Step 2) */
  const [vehicleSubType, setVehicleSubType] = useState('');

  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [gstPercent, setGstPercent] = useState('18');
  const [employees, setEmployees] = useState([]);
  const [tiers, setTiers] = useState({ high_value: [], frequent: [] });
  const [matchedTier, setMatchedTier] = useState(null);
  // In JobCardCreate
  const [amountGiven, setAmountGiven] = useState(0);



  useEffect(() => {
    getSettings()
      .then(data => {
        const s = data.find(d => d.field_name === 'default_gst_percent');
        if (s?.value) setGstPercent(s.value);
      })
      .catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    listEmployees()
      .then(data => setEmployees(Array.isArray(data) ? data : (data.results || [])))
      .catch(err => toast.error(extractError(err)));
    getCustomerTiers().then(setTiers).catch(() => { });
  }, []); // eslint-disable-line

  /* Load garages whenever garage mode is active */
  useEffect(() => {
    if (ownerType !== 'garage') return;
    setLoadingGarages(true);
    listGarageOwners(garageSearch ? { q: garageSearch } : undefined)
      .then(d => setGarages(Array.isArray(d) ? d : []))
      .catch(() => { })
      .finally(() => setLoadingGarages(false));
    // eslint-disable-next-line
  }, [ownerType, garageSearch]);

  const updateJobCard = (k, v) => setJobCard((f) => ({ ...f, [k]: v }));
  const updateCustomer = (k, v) => setCustomer((f) => ({ ...f, [k]: v }));
  const updateVehicle = (k, v) => setVehicle((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (step !== 3 || services.length > 0) return;
    setLoadingServices(true);
    const currentVehicleType = vehicleMatch
      ? vehicleMatch.vehicle?.vehicle_type
      : vehicle.vehicle_type;
    listServicesWithVehicleType(currentVehicleType)
      .then((d) => setServices(Array.isArray(d) ? d : (d.results || [])))
      .catch((err) => toast.error(extractError(err)))
      .finally(() => setLoadingServices(false));
    // eslint-disable-next-line
  }, [step]);

  /* Effective pricing type derived from vehicle info */
  const effectivePricingType = vehicleMatch
    ? getEffectivePricingType(vehicleMatch.vehicle?.vehicle_type, vehicleSubType)
    : getEffectivePricingType(vehicle.vehicle_type, vehicleSubType);

  /* ── Validation ─────────────────────────────────────────────────────────── */
  const validateStep1 = () => {
    const e = {};
    if (!jobCard.job_card_date) e.job_card_date = 'Required';
    if (!jobCard.vehicle_number.trim()) e.vehicle_number = 'Required';
    if (!jobCard.vehicle_entry_time) e.vehicle_entry_time = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = () => {
    const e = {};
    if (ownerType !== 'garage') {
      if (!customer.phone_number.trim()) e.phone_number = 'Required';
      if (!customerMatch && !customer.customer_name.trim()) e.customer_name = 'Required';
    }
    if (!vehicle.vehicle_type) e.vehicle_type = 'Required';
    if (vehicle.vehicle_type === 'four_wheeler' && !vehicleSubType) {
      e.vehicle_sub_type = 'Please select a vehicle body type';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep3 = () => {
    const e = {};
    if (!jobCard.employee) e.employee = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const resolveTier = (customerId) => {
    if (!customerId) return null;
    const hvEntry = tiers.high_value.find(t => t.id === customerId);
    if (hvEntry) return { type: 'H', label: 'High-Value Customer', value: `₹${Number(hvEntry.revenue).toLocaleString('en-IN')} total revenue` };
    const fqEntry = tiers.frequent.find(t => t.id === customerId);
    if (fqEntry) return { type: 'F', label: 'Frequent Visitor', value: `${fqEntry.visits} visit${fqEntry.visits !== 1 ? 's' : ''}` };
    return null;
  };

  /* ── Navigation ─────────────────────────────────────────────────────────── */

  /* Step 1 → check vehicle; handle both customer and garage modes */
  const handleNextFromStep1 = async () => {
    if (!validateStep1()) return;
    if (ownerType === 'garage' && !selectedGarage) {
      toast.error('Please select a garage before continuing');
      return;
    }
    setChecking(true);
    try {
      const result = await checkVehicle(jobCard.vehicle_number.trim());
      if (result && result.exists) {
        /* Vehicle found — auto-detect if it's a garage vehicle */
        if (result.is_garage && result.garage) {
          setOwnerType('garage');
          setSelectedGarage(result.garage);
        }
        setVehicleMatch({ customer: result.customer, vehicle: result.vehicle });
        setMatchedTier(resolveTier(result.customer?.id));
        setCustomerMatch(null);
        setStep(3);
      } else {
        setVehicleMatch(null);
        setCustomerMatch(null);
        setMatchedTier(null);
        setStep(2);
      }
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setChecking(false);
    }
  };

  /* Step 2 → check customer by phone, then go to Step 3 */
  const handleNextFromStep2 = async () => {
    if (!validateStep2()) return;
    setChecking(true);
    try {
      const result = await checkCustomer(customer.phone_number.trim());
      if (result && result.exists) {
        setCustomerMatch({ customer: result.customer });
        setMatchedTier(resolveTier(result.customer?.id));
      } else {
        setCustomerMatch(null);
      }
    } catch (_) {
      /* silent — proceed even if lookup fails */
    } finally {
      setChecking(false);
    }
    setStep(3);
  };

  const handleNextFromStep3 = () => {
    if (!validateStep3()) return;
    setStep(4);

  }

  const toggleService = (id) => {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const visibleServices = filterServicesForVehicle(services, effectivePricingType);

  const basePrice = visibleServices
    .filter((s) => selectedServiceIds.includes(s.id))
    .reduce((sum, s) => sum + getServicePrice(s, effectivePricingType), 0);
  const gstAmount = basePrice * Number(gstPercent || 0) / 100;
  const totalPrice = basePrice + gstAmount;

  /* ── Submit ─────────────────────────────────────────────────────────────── */
  const submit = async () => {
    const e = {};
    if (Object.keys(e).length) { setErrors(e); return; }
    if (selectedServiceIds.length === 0) {
      toast.error('Select at least one service');
      return;
    }
    setSubmitting(true);
    try {
      const currentVehicleType = vehicleMatch
        ? vehicleMatch.vehicle?.vehicle_type
        : vehicle.vehicle_type;

      const jobCardCore = {
        job_card_date: jobCard.job_card_date,
        vehicle_kilometers: Number(jobCard.vehicle_kilometers),
        vehicle_entry_time: new Date(jobCard.vehicle_entry_time).toISOString(),
        vehicle_expected_exit_time: jobCard.vehicle_expected_exit_time ? new Date(jobCard.vehicle_expected_exit_time).toISOString() : null,
        complaints: complaints,
        gst_percent: Number(gstPercent || 18),
        vehicle_sub_type: currentVehicleType === 'four_wheeler' ? (vehicleSubType || null) : null,
        ...(jobCard.employee ? { employee: Number(jobCard.employee) } : {}),
        total_amount: totalPrice,
      };

      const vehiclePayload = vehicleMatch
        ? {
          is_new: false,
          id: vehicleMatch.vehicle?.id ?? null,
          vehicle_number: vehicleMatch.vehicle?.vehicle_number ?? jobCard.vehicle_number.trim(),
          vehicle_name: vehicleMatch.vehicle?.vehicle_name ?? '',
          vehicle_type: vehicleMatch.vehicle?.vehicle_type ?? '',
        }
        : {
          is_new: true,
          id: null,
          vehicle_number: jobCard.vehicle_number.trim(),
          vehicle_name: vehicle.vehicle_name.trim(),
          vehicle_company: vehicle.vehicle_company.trim(),
          vehicle_model: vehicle.vehicle_model.trim(),
          vehicle_colour: vehicle.vehicle_colour.trim(),
          vehicle_type: vehicle.vehicle_type,
        };

      /* Build payload — garage mode omits customer, sends garage_id instead */
      const payload = ownerType === 'garage'
        ? {
          job_card: jobCardCore,
          garage_id: selectedGarage.id,
          vehicle: vehiclePayload,
          services: selectedServiceIds,
        }
        : {
          job_card: jobCardCore,
          customer: vehicleMatch
            ? { is_new: false, id: vehicleMatch.customer?.id ?? null, customer_name: vehicleMatch.customer?.customer_name ?? '', phone_number: vehicleMatch.customer?.phone_number ?? '', email: vehicleMatch.customer?.email ?? '' }
            : customerMatch
              ? { is_new: false, id: customerMatch.customer?.id ?? null, customer_name: customerMatch.customer?.customer_name ?? '', phone_number: customerMatch.customer?.phone_number ?? '', email: customerMatch.customer?.email ?? '' }
              : { is_new: true, id: null, customer_name: customer.customer_name.trim(), phone_number: customer.phone_number.trim(), email: customer.email.trim() },
          vehicle: vehiclePayload,
          services: selectedServiceIds,
        };
      const payloadWithPayment = showPaymentPage ? { ...payload, amount_given: amountGiven, payment_type: paymentType } : payload;
      const created = await createFullJobCard(payloadWithPayment);
      downloadJobCardInvoice(created);
      toast.success('Job card created — invoice downloaded');
      navigate(`/jobcards/${created.id}`);
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  /* Step 2 is always skipped when vehicle is matched */
  const skippedCustomer = !!vehicleMatch;

  return (
    <div>
      <PageHeader
        title="New Job Card"
        breadcrumbs={
          <Link to="/jobcards" className="hover:text-gray-300 inline-flex items-center gap-1">
            <ChevronLeft size={12} /> Back to Job Cards
          </Link>
        }
      />

      <Stepper step={step} skippedCustomer={skippedCustomer} />

      <div className="flex gap-4 items-start mt-4">
        {/* ── Main form card ─────────────────────────────────────── */}
        <div className="bg-bg-card border border-border rounded-xl p-4 sm:p-6 flex-1 min-w-0 max-w-3xl">
          {step === 1 && (
            <div className="space-y-5">
              {/* Owner type toggle */}
              <OwnerTypeToggle
                value={ownerType}
                onChange={(t) => { setOwnerType(t); setSelectedGarage(null); setGarageSearch(''); }}
              />

              <Step1
                form={jobCard}
                update={updateJobCard}
                errors={errors}
              />
            </div>
          )}

          {step === 2 && (
            <Step2
              customer={customer}
              vehicle={vehicle}
              vehicleSubType={vehicleSubType}
              setVehicleSubType={setVehicleSubType}
              complaints={complaints}
              setComplaints={setComplaints}
              updateCustomer={updateCustomer}
              updateVehicle={(k, v) => {
                updateVehicle(k, v);
                if (k === 'vehicle_type') setVehicleSubType('');
              }}
              errors={errors}
              customerMatch={customerMatch}
              ownerType={ownerType}
              selectedGarage={selectedGarage}
            />
          )}

          {step === 3 && (
            <Step3
              services={visibleServices}
              loading={loadingServices}
              selectedIds={selectedServiceIds}
              onToggle={toggleService}
              effectivePricingType={effectivePricingType}
              basePrice={basePrice}
              gstPercent={gstPercent}
              gstAmount={gstAmount}
              totalPrice={totalPrice}
              onGstChange={setGstPercent}
              matchedCustomer={vehicleMatch?.customer}
              matchedVehicle={vehicleMatch?.vehicle}
              matchedTier={matchedTier}
              jobCardForm={jobCard}
              updateJobCard={updateJobCard}
              employees={employees}
              errors={errors}
              ownerType={ownerType}
              selectedGarage={selectedGarage}
            />
          )}
          {step === 4 && (
            <Step4
              showPaymentPage={showPaymentPage}
              onYes={() => { setShowPaymentPage(true); setAmountGiven(totalPrice); }}
              onNo={() => submit()}
              paymentType={paymentType}
              setPaymentType={setPaymentType}
              totalPrice={totalPrice}
              amountGiven={amountGiven === 0 ? totalPrice : amountGiven}
              setAmountGiven={setAmountGiven}
            />
          )}

          <div className="flex justify-between items-center gap-2 mt-6 pt-6 border-t border-border">
            <Link to="/jobcards">
              <Button variant="ghost" type="button">Cancel</Button>
            </Link>
            <div className="flex gap-2">
              {step === 2 && (
                <Button variant="secondary" type="button" onClick={() => setStep(1)}>
                  <ChevronLeft size={14} /> Back
                </Button>
              )}
              {step === 3 && (
                <Button variant="secondary" type="button" onClick={() => setStep(vehicleMatch ? 1 : 2)}>
                  <ChevronLeft size={14} /> Back
                </Button>
              )}
              {step === 1 && (
                <Button type="button" loading={checking} onClick={handleNextFromStep1}>
                  Next <ChevronRight size={14} />
                </Button>
              )}
              {step === 2 && (
                <Button type="button" loading={checking} onClick={handleNextFromStep2}>
                  Next <ChevronRight size={14} />
                </Button>
              )}
              {step === 3 && (
                <Button type="button" loading={checking} onClick={handleNextFromStep3}>
                  Next <ChevronRight size={14} />
                </Button>
              )}
              {step === 4 && (
                <Button type="button" variant="success" loading={submitting} onClick={submit}>
                  <Check size={14} /> Confirm
                </Button>
              )}
            </div>
          </div>
          {/* ── Right-side garage panel — only visible in garage mode, step 1 ── */}
        </div>
        {ownerType === 'garage' && step === 1 && (
          <div className="w-80 shrink-0 bg-bg-card border border-border rounded-xl overflow-hidden sticky top-4">
            <GaragePanel
              garages={garages}
              loading={loadingGarages}
              selected={selectedGarage}
              onSelect={setSelectedGarage}
              search={garageSearch}
              onSearch={setGarageSearch}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Stepper({ step, skippedCustomer }) {
  const steps = [
    { n: 1, label: 'Job Card' },
    { n: 2, label: 'Customer & Vehicle' },
    { n: 3, label: 'Services' },
    { n: 4, label: 'Payment' },
  ];
  return (
    <div className="flex items-center gap-2 max-w-3xl">
      {steps.map((s, i) => {
        const isActive = step === s.n;
        const isDone = step > s.n || (s.n === 2 && skippedCustomer && step === 3);
        const isSkipped = s.n === 2 && skippedCustomer && step === 3;
        return (
          <div key={s.n} className="flex items-center gap-2 flex-1">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium border ${isActive
                ? 'bg-accent border-accent text-white'
                : isDone
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-bg-elev border-border text-gray-400'
                }`}
            >
              {isDone ? <Check size={14} /> : s.n}
            </div>
            <span className={`text-xs ${isActive ? 'text-gray-100' : isSkipped ? 'text-gray-500 line-through' : 'text-gray-400'}`}>
              {s.label}
            </span>
            {i < steps.length - 1 && <div className="flex-1 h-px bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Owner Type Toggle ──────────────────────────────────────────────────── */
function OwnerTypeToggle({ value, onChange }) {
  return (
    <div className="flex items-center gap-1 bg-bg-elev border border-border rounded-lg p-1 w-fit">
      {[
        { v: 'customer', label: 'Customer' },
        { v: 'garage', label: 'Garage' },
      ].map(({ v, label }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${value === v
            ? 'bg-accent text-white shadow'
            : 'text-gray-400 hover:text-gray-200'
            }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ─── Garage Panel ───────────────────────────────────────────────────────── */
function GaragePanel({ garages, loading, selected, onSelect, search, onSearch }) {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-bg-elev border-b border-border">
        <p className="text-xs font-semibold text-gray-300 mb-2">Select Garage <span className="text-red-400">*</span></p>
        <div className="relative">
          <input
            type="text"
            placeholder="Search garage by name or phone…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full bg-bg border border-border rounded-md pl-3 pr-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-accent focus:outline-none"
          />
        </div>
      </div>
      <div className="overflow-y-auto divide-y divide-border" style={{ maxHeight: 'calc(100vh - 14rem)' }}>
        {loading ? (
          <div className="py-6 text-center text-xs text-gray-500">Loading…</div>
        ) : garages.length === 0 ? (
          <div className="py-6 text-center text-xs text-gray-500">No garages found. Add one in the Customers → Garages tab.</div>
        ) : (
          garages.map((g) => {
            const isSelected = selected?.id === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onSelect(g)}
                className={`w-full text-left px-4 py-2.5 transition-colors flex items-center gap-3 ${isSelected ? 'bg-accent/10 border-l-2 border-accent' : 'hover:bg-bg-hover'
                  }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-100 truncate">{g.garage_name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{g.name} · {g.phone_number}</div>
                </div>
                {isSelected && <Check size={14} className="text-accent shrink-0" />}
              </button>
            );
          })
        )}
      </div>
      {selected && (
        <div className="px-4 py-2.5 bg-accent/5 border-t border-accent/30 text-xs text-accent font-medium">
          ✓ Selected: {selected.garage_name}
        </div>
      )}
    </div>
  );
}

/* ─── Step 1: vehicle number, date, entry time only ─────────────────────── */
function Step1({ form, update, errors }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Date" required error={errors.job_card_date}>
        <Input
          type="date"
          value={form.job_card_date}
          onChange={(e) => update('job_card_date', e.target.value)}
        />
      </Field>
      <Field label="Vehicle Number" required error={errors.vehicle_number}>
        <Input
          placeholder="e.g. TN09BR2456"
          value={form.vehicle_number}
          onChange={(e) => update('vehicle_number', e.target.value.toUpperCase())}
          style={{ textTransform: 'uppercase' }}
        />
      </Field>
      <div className="md:col-span-2">
        <Field label="Entry Time" required error={errors.vehicle_entry_time}>
          <Input
            type="datetime-local"
            value={form.vehicle_entry_time}
            onChange={(e) => update('vehicle_entry_time', e.target.value)}
          />
        </Field>
      </div>
    </div>
  );
}

/* ─── Step 2: customer details + vehicle details + complaints ───────────── */
function Step2({ customer, vehicle, vehicleSubType, setVehicleSubType, complaints, setComplaints, updateCustomer, updateVehicle, errors, customerMatch, ownerType, selectedGarage }) {
  const handleCompanySelect = async (name, isNew) => {
    updateVehicle('vehicle_company', name);
    updateVehicle('vehicle_model', '');
    if (isNew) await createVehicleCompany({ name, vehicle_type: vehicle.vehicle_type });
  };
  const handleModelSelect = async (name, isNew) => {
    updateVehicle('vehicle_model', name);
    if (isNew) await createVehicleModel({ name, company_name: vehicle.vehicle_company });
  };
  const handleColourSelect = async (name, isNew) => {
    updateVehicle('vehicle_colour', name);
    if (isNew) await createVehicleColour({ name });
  };

  return (
    <div className="space-y-6">

      {/* ── Customer / Garage section ── */}
      {ownerType === 'garage' && selectedGarage ? (
        <div className="bg-sky-900/20 border border-sky-700/50 rounded-lg p-3 text-sm">
          <p className="text-xs font-semibold text-sky-400 mb-1.5">Garage</p>
          <p className="text-gray-100 font-semibold">{selectedGarage.garage_name}</p>
          <p className="text-gray-400 text-xs mt-0.5">{selectedGarage.name} · {selectedGarage.phone_number}{selectedGarage.email ? ` · ${selectedGarage.email}` : ''}</p>
          {selectedGarage.location && <p className="text-gray-500 text-xs mt-0.5">{selectedGarage.location}</p>}
        </div>
      ) : (
        <div>
          <h3 className="text-sm font-semibold text-gray-200 mb-3">Customer Details</h3>

          {/* Phone number always shown — used to look up customer */}
          <div className="mb-4">
            <Field label="Phone Number" required error={errors.phone_number}>
              <Input
                placeholder="+91 9000000000"
                value={customer.phone_number}
                onChange={(e) => updateCustomer('phone_number', e.target.value)}
              />
            </Field>
          </div>

          {customerMatch ? (
            <div className="bg-emerald-900/20 border border-emerald-800 rounded-md p-3 text-sm text-emerald-100">
              Existing customer: <span className="font-semibold">{customerMatch.customer_name}</span>
              {customerMatch.phone_number ? <> · {customerMatch.phone_number}</> : null}
              {customerMatch.email ? <> · {customerMatch.email}</> : null}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Customer Name" required error={errors.customer_name}>
                <Input
                  placeholder="John Doe"
                  value={customer.customer_name}
                  onChange={(e) => updateCustomer('customer_name', e.target.value)}
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  placeholder="john@example.com"
                  value={customer.email}
                  onChange={(e) => updateCustomer('email', e.target.value)}
                />
              </Field>
            </div>
          )}
        </div>
      )}

      {/* ── Vehicle section ── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-200 mb-3">Vehicle Details</h3>
        <div className="space-y-4">

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">
              Vehicle Type <span className="text-red-400">*</span>
            </label>
            <VehicleTypePicker
              value={vehicle.vehicle_type}
              onChange={(v) => {
                updateVehicle('vehicle_type', v);
                updateVehicle('vehicle_company', '');
                updateVehicle('vehicle_model', '');
                setVehicleSubType('');
              }}
              error={errors.vehicle_type}
            />
          </div>

          {/* Four-wheeler sub-type picker */}
          {vehicle.vehicle_type === 'four_wheeler' && (
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Vehicle Body Type <span className="text-red-400">*</span>
              </label>
              <p className="text-xs text-gray-500 mb-2">Determines which service prices apply.</p>
              <FourWheelerSubTypePicker
                value={vehicleSubType}
                onChange={setVehicleSubType}
                error={errors.vehicle_sub_type}
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <VehicleAutocomplete
              label="Company / Make"
              value={vehicle.vehicle_company}
              onChange={(v) => updateVehicle('vehicle_company', v)}
              onSelect={handleCompanySelect}
              fetchOptions={(q) => listVehicleCompanies({ q, vehicle_type: vehicle.vehicle_type })}
              onCreate={(name) => createVehicleCompany({ name, vehicle_type: vehicle.vehicle_type })}
              placeholder="e.g. Honda"
              error={errors.vehicle_company}
            />
            <VehicleAutocomplete
              label="Model"
              value={vehicle.vehicle_model}
              onChange={(v) => updateVehicle('vehicle_model', v)}
              onSelect={handleModelSelect}
              fetchOptions={(q) => listVehicleModels({ q, company: vehicle.vehicle_company })}
              onCreate={(name) => createVehicleModel({ name, company_name: vehicle.vehicle_company })}
              placeholder="e.g. City"
              error={errors.vehicle_model}
            />
            <VehicleAutocomplete
              label="Colour"
              value={vehicle.vehicle_colour}
              onChange={(v) => updateVehicle('vehicle_colour', v)}
              onSelect={handleColourSelect}
              fetchOptions={(q) => listVehicleColours({ q })}
              onCreate={(name) => createVehicleColour({ name })}
              placeholder="e.g. White"
              error={errors.vehicle_colour}
            />
          </div>
        </div>
      </div>

      {/* ── Complaints ── */}
      <div>
        <Field label="Complaints / Notes">
          <Textarea
            rows={3}
            placeholder="Customer complaints, requested work, etc."
            value={complaints}
            onChange={(e) => setComplaints(e.target.value)}
          />
        </Field>
      </div>
    </div>
  );
}

/* ─── Step 3: Services ───────────────────────────────────────────────────── */
function Step3({ services, loading, selectedIds, onToggle, effectivePricingType, basePrice, gstPercent, gstAmount, totalPrice, onGstChange, matchedCustomer, matchedVehicle, matchedTier, jobCardForm, updateJobCard, employees, errors, ownerType, selectedGarage }) {
  if (loading) return <Loading label="Loading services..." />;

  return (
    <div className="space-y-4">

      {/* ── Vehicle KM, Expected Exit Time, Employee (moved from Step 1) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-border">
        <Field label="Vehicle KM" required error={errors.vehicle_kilometers}>
          <Input
            type="number"
            step="0.01"
            placeholder="e.g. 45000"
            value={jobCardForm.vehicle_kilometers}
            onChange={(e) => updateJobCard('vehicle_kilometers', e.target.value)}
          />
        </Field>
        <Field label="Expected Exit Time" required error={errors.vehicle_expected_exit_time}>
          <Input
            type="datetime-local"
            value={jobCardForm.vehicle_expected_exit_time}
            onChange={(e) => updateJobCard('vehicle_expected_exit_time', e.target.value)}
          />
        </Field>
        <Field label="Employee" required error={errors.employee}>
          <Select
            value={jobCardForm.employee}
            onChange={(e) => updateJobCard('employee', e.target.value)}
          >
            <option value="">Select employee (optional)</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.employee_name}</option>
            ))}
          </Select>
        </Field>
      </div>

      {matchedVehicle && ownerType === 'garage' && selectedGarage && (
        <div className="bg-sky-900/20 border border-sky-700/50 rounded-md p-3 text-sm">
          Matched vehicle <span className="font-semibold text-sky-300">{matchedVehicle.vehicle_number}</span>
          {' · '}Garage: <span className="font-semibold text-sky-300">{selectedGarage.garage_name}</span>
        </div>
      )}
      {matchedVehicle && ownerType !== 'garage' && matchedCustomer && (
        <div className="bg-emerald-900/20 border border-emerald-800 rounded-md p-3 text-sm text-emerald-100">
          Matched existing vehicle <span className="font-semibold">{matchedVehicle.vehicle_number}</span> ·
          Customer: <span className="font-semibold">{matchedCustomer.customer_name}</span>
        </div>
      )}
      {matchedTier && (
        <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${matchedTier.type === 'H'
          ? 'bg-violet-900/20 border-violet-700/50'
          : 'bg-cyan-900/20 border-cyan-700/50'
          }`}>
          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-extrabold shrink-0 ${matchedTier.type === 'H'
            ? 'bg-violet-800/60 text-violet-200 border border-violet-600/50'
            : 'bg-cyan-800/60 text-cyan-200 border border-cyan-600/50'
            }`}>{matchedTier.type}</span>
          <div>
            <div className={`text-xs font-semibold ${matchedTier.type === 'H' ? 'text-violet-300' : 'text-cyan-300'}`}>
              {matchedTier.label}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">{matchedTier.value}</div>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-200 mb-1">Select Services</h3>
        {effectivePricingType && (
          <p className="text-xs text-gray-500 mb-3">
            Showing services for <span className="text-accent capitalize">{effectivePricingType.replace('_', ' ')}</span>.
            Vehicle-specific prices applied where configured.
          </p>
        )}
        {services.length === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center border border-dashed border-border rounded-md">
            No services available{effectivePricingType ? ' for this vehicle type' : ''}.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {services.map((s) => {
              const checked = selectedIds.includes(s.id);
              const price = getServicePrice(s, effectivePricingType);
              const hasCustomPrice = effectivePricingType && (s.vehicle_prices || []).some(vp => vp.vehicle_type === effectivePricingType);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onToggle(s.id)}
                  className={`text-left p-3 rounded-md border transition-colors ${checked ? 'bg-accent/10 border-accent' : 'bg-bg border-border hover:border-gray-600'
                    }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-100 truncate">{s.service_name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{s.service_code}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold text-gray-100">₹{price.toFixed(2)}</div>
                      {hasCustomPrice && (
                        <div className="text-[10px] text-accent mt-0.5">vehicle price</div>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${checked ? 'bg-accent border-accent' : 'border-border'}`}>
                      {checked && <Check size={12} className="text-white" />}
                    </div>
                    <span className="text-xs text-gray-400">{checked ? 'Selected' : 'Tap to select'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* GST + price summary */}
      <div className="rounded-md bg-bg-elev border border-border p-4 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-gray-400">{selectedIds.length} service{selectedIds.length === 1 ? '' : 's'} selected</span>
          <span className="text-gray-300">Base: ₹{basePrice.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <label className="text-gray-400 shrink-0">GST %</label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={gstPercent}
            onChange={e => onGstChange(e.target.value)}
            className="w-24 bg-bg border border-border rounded-md px-3 py-1.5 text-sm text-gray-100 text-right focus:outline-none focus:border-accent"
          />
        </div>
        <div className="flex items-center justify-between text-gray-400">
          <span>GST Amount</span>
          <span>₹{gstAmount.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="font-semibold text-gray-100">Total</span>
          <span className="text-lg font-semibold text-gray-100">₹{totalPrice.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

function PayMentModal({ value, onChange, totalPrice, setAmountGiven, amountGiven }) {
  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-gray-400 shrink-0">Payment Type</span>
        <Select value={value} onChange={onChange}>
          <option value="cash">Cash</option>
          <option value="upi">UPI</option>
        </Select>
      </div>
      {value === 'cash'
        ? <CashModal totalPrice={totalPrice} setAmountGiven={setAmountGiven} amountGiven={amountGiven} />
        : <UPIModal totalPrice={totalPrice} />
      }
    </div>
  );
}

function Step4({ showPaymentPage, onYes, onNo, paymentType, setPaymentType, totalPrice, amountGiven, setAmountGiven }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-100 mb-1">Payment</h2>
        <p className="text-sm text-gray-400">Would you like to collect payment now?</p>
      </div>
      <div className="flex gap-3">
        <Button type="button" variant={showPaymentPage ? 'success' : 'secondary'} onClick={onYes}>
          Yes, pay now
        </Button>
        <Button type="button" variant={!showPaymentPage ? 'secondary' : 'ghost'} onClick={onNo}>
          Pay later
        </Button>
      </div>
      {showPaymentPage
        ? (
          <PayMentModal
            value={paymentType}
            onChange={(e) => setPaymentType(e.target.value)}
            totalPrice={totalPrice}
            setAmountGiven={setAmountGiven}
            amountGiven={amountGiven}
          />
        ) : (
          <div className="rounded-md border border-border bg-bg-elev px-4 py-3 text-sm text-gray-400">
            Payment can be collected later from the Job Card details page.
          </div>
        )
      }
    </div>
  );
}

function CashModal({ totalPrice, setAmountGiven, amountGiven }) {
  const change = totalPrice - amountGiven
  return (
    <div className="rounded-xl border border-border bg-bg-elev p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-200">Cash Payment</h3>
      <Field label="Total Amount">
        <Input value={`₹${totalPrice.toFixed(2)}`} disabled />
      </Field>
      <Field label="Amount Received">
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={amountGiven || ''}
          onChange={(e) => {
            const value = parseFloat(e.target.value) || 0;
            if (value > totalPrice) {
              toast.error('Amount received cannot exceed total price');
              return;   // ← don't update state, reject the keystroke
            }
            setAmountGiven(value);
          }}
        />
      </Field>
      <Field label="Change to Return">
        <Input disabled value={change > 0 ? change.toFixed(2) : ''} />
      </Field>
    </div>
  );
}

function UPIModal({ totalPrice }) {
  return (
    <div className="rounded-xl border border-border bg-bg-elev p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-200">UPI Payment</h3>
      <p className="text-sm text-gray-400">
        Please scan the QR code below to pay{' '}
        <span className="font-semibold text-gray-100">₹{totalPrice.toFixed(2)}</span>
      </p>
      <div className="flex justify-center">
        <UpiQr amount={totalPrice} />
      </div>
    </div>
  );
}