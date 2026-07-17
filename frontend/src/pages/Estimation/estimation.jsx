import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, FileText, ArrowLeft, Eye } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Button from '../../components/Button';
import Modal from '../../components/Modal';
import { Field, Input, Select } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { listServicesWithVehicleType } from '../../api/services';
import { createEstimation } from '../../api/estimation';
import { extractError } from '../../api/axios';

const VEHICLE_LABEL = {
  two_wheeler: 'Two Wheeler',
  three_wheeler: 'Three Wheeler',
  four_wheeler: 'Four Wheeler',
  others: 'Others',
};

const fmt = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Map the estimation vehicle type / sub-type onto the service vehicle-pricing keys
// so we can pre-fill a line item with the correct per-vehicle price when one exists.
const SUB_TYPE_PRICE_KEY = {
  SUV: 'suv',
  CompactSUV: 'compact_suv',
  Sedan: 'sedan',
  Hatchback: 'hatchback',
  others: 'four_wheeler_others',
};

function resolvePrice(service, vehicleType, vehicleSubType) {
  const prices = service.vehicle_prices || [];
  let key = null;
  if (vehicleType === 'two_wheeler') key = 'two_wheeler';
  else if (vehicleType === 'four_wheeler') key = SUB_TYPE_PRICE_KEY[vehicleSubType] || null;
  else key = 'others';

  const match = key && prices.find((p) => p.vehicle_type === key);
  if (match) return Number(match.price);
  return Number(service.service_price || 0);
}

let rowSeq = 0;
const newRow = (service_name = '', amount = '') => ({ key: ++rowSeq, service_name, amount });

export default function Estimation() {
  const toast = useToast();
  const navigate = useNavigate();

  const [customerData, setCustomerData] = useState({
    customer_name: '',
    customer_phone_number: '',
    vehicle_name: '',
    vehicle_type: '',
    vehicle_sub_type: '',
  });
  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [items, setItems] = useState([newRow()]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState(null); // holds the built payload while previewing

  useEffect(() => {
    const vehicle_type = customerData.vehicle_type;
    if (!vehicle_type) {
      setServices([]);
      return;
    }
    setLoadingServices(true);
    listServicesWithVehicleType(vehicle_type)
      .then((response) => setServices(Array.isArray(response) ? response : response.results || []))
      .catch((error) => {
        console.error('Error fetching services:', error);
        setServices([]);
      })
      .finally(() => setLoadingServices(false));
  }, [customerData.vehicle_type]);

  const update = (key, value) => setCustomerData((c) => ({ ...c, [key]: value }));

  const total = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0),
    [items]
  );

  const updateItem = (key, field, value) =>
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  const removeItem = (key) => setItems((rows) => rows.filter((r) => r.key !== key));

  const addBlankItem = () => setItems((rows) => [...rows, newRow()]);

  const addServiceItem = (serviceId) => {
    if (!serviceId) return;
    const service = services.find((s) => String(s.id) === String(serviceId));
    if (!service) return;
    const price = resolvePrice(service, customerData.vehicle_type, customerData.vehicle_sub_type);
    setItems((rows) => {
      // Replace the leading empty placeholder row if it's still untouched.
      const first = rows[0];
      const rest =
        rows.length === 1 && first && !first.service_name && !first.amount ? [] : rows;
      return [...rest, newRow(service.service_name, price)];
    });
  };

  const validate = () => {
    const e = {};
    if (!customerData.customer_name.trim()) e.customer_name = 'Customer name is required';
    if (!/^\d{10}$/.test(customerData.customer_phone_number.trim()))
      e.customer_phone_number = 'Enter a valid 10-digit phone number';
    if (!customerData.vehicle_type) e.vehicle_type = 'Select a vehicle type';
    if (customerData.vehicle_type === 'four_wheeler' && !customerData.vehicle_sub_type)
      e.vehicle_sub_type = 'Select a sub type';

    const validItems = items.filter((it) => it.service_name.trim() && Number(it.amount) > 0);
    if (validItems.length === 0) e.items = 'Add at least one service with an amount';
    setErrors(e);
    return { ok: Object.keys(e).length === 0, validItems };
  };

  // Validate, build the payload, and open the preview dialog (no POST yet).
  const openPreview = (ev) => {
    ev.preventDefault();
    const { ok, validItems } = validate();
    if (!ok) return;

    // vehicle_sub_type is required by the backend for every vehicle type,
    // so fall back to "others" when it isn't a four-wheeler.
    const payload = {
      customer_name: customerData.customer_name.trim(),
      customer_phone_number: customerData.customer_phone_number.trim(),
      vehicle_name: customerData.vehicle_name.trim(),
      vehicle_type: customerData.vehicle_type,
      vehicle_sub_type:
        customerData.vehicle_type === 'four_wheeler'
          ? customerData.vehicle_sub_type
          : 'others',
      items: validItems.map((it) => ({
        service_name: it.service_name.trim(),
        amount: Number(it.amount),
      })),
    };
    setPreview(payload);
  };

  // Confirm from the preview dialog → actually POST to the backend.
  const confirmSubmit = async () => {
    if (!preview) return;
    setSubmitting(true);
    try {
      await createEstimation(preview);
      toast.success('Estimation created successfully');
      navigate('/estimation');
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="New Estimation"
        subtitle="Prepare a quick price estimate for a customer"
        actions={
          <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft size={14} /> Back
          </Button>
        }
      />

      <form onSubmit={openPreview} className="space-y-6">
        {/* Customer & vehicle details */}
        <div className="bg-bg-card border border-border rounded-xl p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-gray-200 mb-4">Customer & Vehicle</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Customer Name" required error={errors.customer_name}>
              <Input
                type="text"
                placeholder="Customer Name"
                value={customerData.customer_name}
                onChange={(e) => update('customer_name', e.target.value)}
              />
            </Field>

            <Field label="Customer Phone Number" required error={errors.customer_phone_number}>
              <Input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="9876543210"
                value={customerData.customer_phone_number}
                onChange={(e) =>
                  update('customer_phone_number', e.target.value.replace(/\D/g, '').slice(0, 10))
                }
              />
            </Field>

            <Field label="Vehicle Name">
              <Input
                type="text"
                placeholder="Innova, Swift"
                value={customerData.vehicle_name}
                onChange={(e) => update('vehicle_name', e.target.value)}
              />
            </Field>

            <Field label="Vehicle Type" required error={errors.vehicle_type}>
              <Select
                value={customerData.vehicle_type}
                onChange={(e) => {
                  update('vehicle_type', e.target.value);
                  if (e.target.value !== 'four_wheeler') update('vehicle_sub_type', '');
                }}
              >
                <option value="">Select vehicle type…</option>
                <option value="two_wheeler">Two Wheeler</option>
                <option value="three_wheeler">Three Wheeler</option>
                <option value="four_wheeler">Four Wheeler</option>
                <option value="others">Others</option>
              </Select>
            </Field>

            {customerData.vehicle_type === 'four_wheeler' && (
              <Field label="Vehicle Sub Type" required error={errors.vehicle_sub_type}>
                <Select
                  value={customerData.vehicle_sub_type}
                  onChange={(e) => update('vehicle_sub_type', e.target.value)}
                >
                  <option value="">Select sub type…</option>
                  <option value="SUV">SUV</option>
                  <option value="CompactSUV">Compact SUV</option>
                  <option value="Sedan">Sedan</option>
                  <option value="Hatchback">Hatchback</option>
                  <option value="others">Others</option>
                </Select>
              </Field>
            )}
          </div>
        </div>

        {/* Line items */}
        <div className="bg-bg-card border border-border rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-gray-200">Services</h2>
            <div className="w-full sm:w-64">
              <Select
                value=""
                disabled={!customerData.vehicle_type || loadingServices}
                onChange={(e) => addServiceItem(e.target.value)}
              >
                <option value="">
                  {!customerData.vehicle_type
                    ? 'Select a vehicle type first'
                    : loadingServices
                    ? 'Loading services…'
                    : services.length === 0
                    ? 'No services available'
                    : '+ Add a service…'}
                </option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.service_name} · {fmt(resolvePrice(s, customerData.vehicle_type, customerData.vehicle_sub_type))}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {errors.items && <p className="text-xs text-red-400 mb-3">{errors.items}</p>}

          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.key} className="flex items-start gap-2">
                <div className="flex-1">
                  <Input
                    type="text"
                    placeholder="Service name"
                    value={it.service_name}
                    onChange={(e) => updateItem(it.key, 'service_name', e.target.value)}
                  />
                </div>
                <div className="w-28 sm:w-36">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Amount"
                    value={it.amount}
                    onChange={(e) => updateItem(it.key, 'amount', e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(it.key)}
                  disabled={items.length === 1}
                  className="mt-1.5 p-1.5 text-gray-500 hover:text-red-400 disabled:opacity-30 disabled:hover:text-gray-500 transition-colors"
                  title="Remove"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addBlankItem}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
          >
            <Plus size={14} /> Add custom line
          </button>

          <div className="mt-5 pt-4 border-t border-border flex items-center justify-between">
            <span className="text-sm font-medium text-gray-300">Total</span>
            <span className="text-lg font-semibold text-gray-100">{fmt(total)}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit">
            <Eye size={15} /> Preview
          </Button>
        </div>
      </form>

      {/* Preview dialog — confirm before posting to the backend */}
      <Modal
        open={!!preview}
        onClose={() => !submitting && setPreview(null)}
        title="Estimation Preview"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPreview(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={confirmSubmit} loading={submitting}>
              <FileText size={15} /> Submit
            </Button>
          </>
        }
      >
        {preview && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-500">Customer</div>
                <div className="text-gray-100 mt-0.5">{preview.customer_name}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-500">Phone</div>
                <div className="text-gray-100 mt-0.5">{preview.customer_phone_number}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-500">Vehicle</div>
                <div className="text-gray-100 mt-0.5">{preview.vehicle_name || '—'}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-500">Vehicle Type</div>
                <div className="text-gray-100 mt-0.5">
                  {VEHICLE_LABEL[preview.vehicle_type] || preview.vehicle_type}
                  {preview.vehicle_type === 'four_wheeler' && preview.vehicle_sub_type
                    ? ` · ${preview.vehicle_sub_type}`
                    : ''}
                </div>
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">Services</div>
              <div className="divide-y divide-border border border-border rounded-lg">
                {preview.items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-sm text-gray-200">{it.service_name}</span>
                    <span className="text-sm text-gray-100 font-medium">{fmt(it.amount)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2.5 bg-bg-elev">
                  <span className="text-sm font-medium text-gray-300">Total</span>
                  <span className="text-base font-semibold text-gray-100">
                    {fmt(preview.items.reduce((s, it) => s + Number(it.amount || 0), 0))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
