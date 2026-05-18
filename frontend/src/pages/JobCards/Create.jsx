import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import { Field, Input, Select, Textarea } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { checkVehicle, checkCustomer } from '../../api/customers';
import { createFullJobCard } from '../../api/jobcards';
import { listServices } from '../../api/services';
import { extractError } from '../../api/axios';

const nowLocal = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const VEHICLE_TYPES = [
  { value: 'two_wheeler', label: 'Two Wheeler' },
  { value: 'three_wheeler', label: 'Three Wheeler' },
  { value: 'four_wheeler', label: 'Four Wheeler' },
  { value: 'other', label: 'Other' },
];

export default function JobCardCreate() {
  const navigate = useNavigate();
  const toast = useToast();

  const [step, setStep] = useState(1);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const [vehicleMatch, setVehicleMatch] = useState(null); // { customer, vehicle } when existing
  const [customerMatch, setCustomerMatch] = useState(null); // when customer exist but vehicle doesn't
  const [jobCard, setJobCard] = useState({
    job_card_number: '',
    job_card_date: new Date().toISOString().slice(0, 10),
    vehicle_number: '',
    vehicle_kilometers: '',
    vehicle_entry_time: nowLocal(),
    vehicle_expected_exit_time: '',
    complaints: '',
    phone_number: '',
  });

  const [customer, setCustomer] = useState({
    customer_name: '',
    phone_number: '',
    email: '',
  });

  const [vehicle, setVehicle] = useState({
    vehicle_name: '',
    vehicle_type: 'four_wheeler',
  });

  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);

  const updateJobCard = (k, v) => setJobCard((f) => ({ ...f, [k]: v }));
  const updateCustomer = (k, v) => setCustomer((f) => ({ ...f, [k]: v }));
  const updateVehicle = (k, v) => setVehicle((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (step !== 3 || services.length > 0) return;
    setLoadingServices(true);
    listServices()
      .then((d) => setServices(Array.isArray(d) ? d : (d.results || [])))
      .catch((err) => toast.error(extractError(err)))
      .finally(() => setLoadingServices(false));
    // eslint-disable-next-line
  }, [step]);

  const validateStep1 = () => {
    const e = {};
    if (!jobCard.job_card_number.trim()) e.job_card_number = 'Required';
    if (!jobCard.job_card_date) e.job_card_date = 'Required';
    if (!jobCard.vehicle_number.trim()) e.vehicle_number = 'Required';
    if (jobCard.vehicle_kilometers === '' || isNaN(Number(jobCard.vehicle_kilometers))) e.vehicle_kilometers = 'Required';
    if (!jobCard.vehicle_entry_time) e.vehicle_entry_time = 'Required';
    if (!jobCard.vehicle_expected_exit_time) e.vehicle_expected_exit_time = 'Required';
    if (!jobCard.phone_number.trim()) e.phone_number = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = () => {
    const e = {};
    if (!customerMatch) {
      if (!customer.customer_name.trim()) e.customer_name = 'Required';
      if (!customer.phone_number.trim()) e.phone_number = 'Required';
      if (!customer.email.trim()) e.email = 'Required';
    }
    if (!vehicle.vehicle_name.trim()) e.vehicle_name = 'Required';
    if (!vehicle.vehicle_type) e.vehicle_type = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNextFromStep1 = async () => {
    if (!validateStep1()) return;
    setChecking(true);
    try {
      const result = await checkVehicle(jobCard.vehicle_number.trim());
      const customerResult = await checkCustomer(jobCard.phone_number.trim());
      console.log(customerResult.customer);
      if (result && result.exists) {
        setVehicleMatch({ customer: result.customer, vehicle: result.vehicle });
        setStep(3);
      } else if (customerResult && customerResult.exists) {

        setCustomerMatch({ customer: customerResult.customer });
        setVehicleMatch(null);
        setStep(2);
      }
      else {
        setVehicleMatch(null);
        setCustomerMatch(null);
        setStep(2);
      }
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setChecking(false);
    }
  };

  const handleNextFromStep2 = () => {
    if (!validateStep2()) return;
    setStep(3);
  };

  const handleBackFromStep3 = () => {
    setStep(vehicleMatch ? 1 : 2);
  };

  const toggleService = (id) => {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const totalPrice = services
    .filter((s) => selectedServiceIds.includes(s.id))
    .reduce((sum, s) => sum + Number(s.service_price || 0), 0);

  const submit = async () => {
    if (selectedServiceIds.length === 0) {
      toast.error('Select at least one service');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        job_card: {
          job_card_number: jobCard.job_card_number.trim(),
          job_card_date: jobCard.job_card_date,
          vehicle_kilometers: Number(jobCard.vehicle_kilometers),
          vehicle_entry_time: new Date(jobCard.vehicle_entry_time).toISOString(),
          vehicle_expected_exit_time: new Date(jobCard.vehicle_expected_exit_time).toISOString(),
          complaints: jobCard.complaints,
        },
        customer: vehicleMatch
          ? {
            is_new: false,
            id: vehicleMatch.customer?.id ?? null,
            customer_name: vehicleMatch.customer?.customer_name ?? '',
            phone_number: vehicleMatch.customer?.phone_number ?? '',
            email: vehicleMatch.customer?.email ?? '',
          }
          : customerMatch
            ? {
              is_new: false,
              id: customerMatch.customer?.id ?? null,
              customer_name: customerMatch.customer?.customer_name ?? '',
              phone_number: customerMatch.customer?.phone_number ?? '',
              email: customerMatch.customer?.email ?? '',
            }
            : {
              is_new: true,
              id: null,
              customer_name: customer.customer_name.trim(),
              phone_number: customer.phone_number.trim(),
              email: customer.email.trim(),
            },
        vehicle: vehicleMatch
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
            vehicle_type: vehicle.vehicle_type,
          },
        services: selectedServiceIds,
      };
      const created = await createFullJobCard(payload);
      toast.success('Job card created');
      navigate(`/jobcards/${created.id}`);
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

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

      <Stepper step={step} skippedCustomer={!!vehicleMatch} />

      <div className="bg-bg-card border border-border rounded-xl p-6 max-w-3xl mt-4">
        {step === 1 && (
          <Step1
            form={jobCard}
            update={updateJobCard}
            errors={errors}
          />
        )}

        {step === 2 && (
          <Step2
            customer={customer}
            vehicle={vehicle}
            updateCustomer={updateCustomer}
            updateVehicle={updateVehicle}
            errors={errors}
            matchedCustomer={customerMatch?.customer}
          />
        )}

        {step === 3 && (
          <Step3
            services={services}
            loading={loadingServices}
            selectedIds={selectedServiceIds}
            onToggle={toggleService}
            totalPrice={totalPrice}
            matchedCustomer={vehicleMatch?.customer}
            matchedVehicle={vehicleMatch?.vehicle}
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
              <Button variant="secondary" type="button" onClick={handleBackFromStep3}>
                <ChevronLeft size={14} /> Back
              </Button>
            )}
            {step === 1 && (
              <Button type="button" loading={checking} onClick={handleNextFromStep1}>
                Next <ChevronRight size={14} />
              </Button>
            )}
            {step === 2 && (
              <Button type="button" onClick={handleNextFromStep2}>
                Next <ChevronRight size={14} />
              </Button>
            )}
            {step === 3 && (
              <Button type="button" variant="success" loading={submitting} onClick={submit}>
                <Check size={14} /> Confirm
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stepper({ step, skippedCustomer }) {
  const steps = [
    { n: 1, label: 'Job Card' },
    { n: 2, label: 'Customer & Vehicle' },
    { n: 3, label: 'Services' },
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
            <span
              className={`text-xs ${isActive ? 'text-gray-100' : isSkipped ? 'text-gray-500 line-through' : 'text-gray-400'
                }`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && <div className="flex-1 h-px bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

function Step1({ form, update, errors }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Job Card Number" required error={errors.job_card_number}>
        <Input
          placeholder="JC-2025-001"
          value={form.job_card_number}
          onChange={(e) => update('job_card_number', e.target.value)}
        />
      </Field>
      <Field label="Date" required error={errors.job_card_date}>
        <Input
          type="date"
          value={form.job_card_date}
          onChange={(e) => update('job_card_date', e.target.value)}
        />
      </Field>
      <Field label="Vehicle Number" required error={errors.vehicle_number}>
        <Input
          placeholder="e.g. KA-01-AB-1234"
          value={form.vehicle_number}
          onChange={(e) => update('vehicle_number', e.target.value)}
        />
      </Field>
      <Field label="Vehicle KM" required error={errors.vehicle_kilometers}>
        <Input
          type="number"
          step="0.01"
          placeholder="e.g. 45000"
          value={form.vehicle_kilometers}
          onChange={(e) => update('vehicle_kilometers', e.target.value)}
        />
      </Field>
      <Field label="Entry Time" required error={errors.vehicle_entry_time}>
        <Input
          type="datetime-local"
          value={form.vehicle_entry_time}
          onChange={(e) => update('vehicle_entry_time', e.target.value)}
        />
      </Field>
      <Field label="Expected Exit Time" required error={errors.vehicle_expected_exit_time}>
        <Input
          type="datetime-local"
          value={form.vehicle_expected_exit_time}
          onChange={(e) => update('vehicle_expected_exit_time', e.target.value)}
        />
      </Field>
      <Field label="Phone Number" required error={errors.phone_number}>
        <Input
          placeholder="+91 9000000000"
          value={form.phone_number}
          onChange={(e) => update('phone_number', e.target.value)}
        />
      </Field>
      <div className="md:col-span-2">
        <Field label="Complaints / Notes">
          <Textarea
            rows={3}
            placeholder="Customer complaints, requested work, etc."
            value={form.complaints}
            onChange={(e) => update('complaints', e.target.value)}
          />
        </Field>
      </div>
    </div>
  );
}

function Step2({ customer, vehicle, updateCustomer, updateVehicle, errors, matchedCustomer }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-200 mb-3">Customer Details</h3>
        {matchedCustomer ? (
          <div className="bg-emerald-900/20 border border-emerald-800 rounded-md p-3 text-sm text-emerald-100">
            Existing customer: <span className="font-semibold">{matchedCustomer.customer_name}</span>
            {matchedCustomer.phone_number ? <> · {matchedCustomer.phone_number}</> : null}
            {matchedCustomer.email ? <> · {matchedCustomer.email}</> : null}
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
            <Field label="Phone Number" required error={errors.phone_number}>
              <Input
                placeholder="+91 9000000000"
                value={customer.phone_number}
                onChange={(e) => updateCustomer('phone_number', e.target.value)}
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Email" required error={errors.email}>
                <Input
                  type="email"
                  placeholder="john@example.com"
                  value={customer.email}
                  onChange={(e) => updateCustomer('email', e.target.value)}
                />
              </Field>
            </div>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-200 mb-3">Vehicle Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Vehicle Name" required error={errors.vehicle_name}>
            <Input
              placeholder="e.g. Honda City"
              value={vehicle.vehicle_name}
              onChange={(e) => updateVehicle('vehicle_name', e.target.value)}
            />
          </Field>
          <Field label="Vehicle Type" required error={errors.vehicle_type}>
            <Select
              value={vehicle.vehicle_type}
              onChange={(e) => updateVehicle('vehicle_type', e.target.value)}
            >
              {VEHICLE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    </div>
  );
}

function Step3({ services, loading, selectedIds, onToggle, totalPrice, matchedCustomer, matchedVehicle }) {
  if (loading) return <Loading label="Loading services..." />;
  return (
    <div className="space-y-4">
      {matchedCustomer && matchedVehicle && (
        <div className="bg-emerald-900/20 border border-emerald-800 rounded-md p-3 text-sm text-emerald-100">
          Matched existing vehicle <span className="font-semibold">{matchedVehicle.vehicle_number}</span> ·
          Customer: <span className="font-semibold">{matchedCustomer.customer_name}</span>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-200 mb-3">Select Services</h3>
        {services.length === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center border border-dashed border-border rounded-md">
            No services available.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {services.map((s) => {
              const checked = selectedIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onToggle(s.id)}
                  className={`text-left p-3 rounded-md border transition-colors ${checked
                    ? 'bg-accent/10 border-accent'
                    : 'bg-bg border-border hover:border-gray-600'
                    }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-100 truncate">{s.service_name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{s.service_code}</div>
                    </div>
                    <div className="text-sm font-semibold text-gray-100 shrink-0">
                      ₹{Number(s.service_price).toFixed(2)}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center ${checked ? 'bg-accent border-accent' : 'border-border'
                        }`}
                    >
                      {checked && <Check size={12} className="text-white" />}
                    </div>
                    <span className="text-xs text-gray-400">
                      {checked ? 'Selected' : 'Tap to select'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between p-3 rounded-md bg-bg-elev border border-border">
        <span className="text-sm text-gray-300">
          {selectedIds.length} service{selectedIds.length === 1 ? '' : 's'} selected
        </span>
        <span className="text-lg font-semibold text-gray-100">
          Total: ₹{totalPrice.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
