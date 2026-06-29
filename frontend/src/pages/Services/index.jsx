import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Wrench, Search, Pencil, Trash2 } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import Table from '../../components/Table';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { Field, Input, Textarea } from '../../components/Field';
import { useToast } from '../../components/Toast';
import {
  listServices, createService, updateService, deleteService,
  upsertServiceVehiclePrice, deleteServiceVehiclePrice,
} from '../../api/services';
import { extractError } from '../../api/axios';

const VEHICLE_PRICING_TYPES = [
  { value: 'two_wheeler', label: 'Two Wheeler' },
  { value: 'sedan', label: 'Sedan' },
  { value: 'compact_suv', label: 'Compact SUV' },
  { value: 'suv', label: 'SUV' },
  { value: 'hatchback', label: 'Hatchback' },
  { value: 'four_wheeler_others', label: '4W Others' },
  { value: 'others', label: 'Others' },
];

export default function ServicesList() {
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [delLoading, setDelLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listServices(search ? { name: search } : undefined);
      setServices(Array.isArray(data) ? data : (data.results || []));
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [search]);

  const onDelete = async () => {
    if (!confirmDel) return;
    setDelLoading(true);
    try {
      await deleteService(confirmDel.id);
      toast.success('Service deleted');
      setConfirmDel(null);
      load();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setDelLoading(false);
    }
  };

  const columns = [
    { key: 'service_name', header: 'Service', render: (r) => <span className="font-medium text-gray-100">{r.service_name}</span> },
    { key: 'service_code', header: 'Code', render: (r) => <code className="text-xs bg-bg-elev px-1.5 py-0.5 rounded text-gray-400">{r.service_code}</code> },
    { key: 'service_price', header: 'Default Price', render: (r) => `₹${Number(r.service_price).toLocaleString('en-IN')}` },
    {
      key: 'reduces_stock',
      header: 'Stock Reduction',
      render: (r) => r.reduces_stock
        ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-900/30 text-emerald-300 border border-emerald-700/40">Yes</span>
        : <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">No</span>,
    },
    {
      key: 'has_warranty',
      header: 'Warranty',
      render: (r) => r.has_warranty
        ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-sky-900/30 text-sky-300 border border-sky-700/40">Yes</span>
        : <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">No</span>,
    },
    {
      key: 'warranty_months',
      header: 'Warranty Period',
      render: (r) => r.has_warranty && r.warranty_months
        ? <span className="text-gray-300">{r.warranty_months} month{r.warranty_months !== 1 ? 's' : ''}</span>
        : <span className="text-gray-600">—</span>,
    },
    {
      key: 'vehicle_pricing',
      header: 'Vehicle Pricing',
      render: (r) => {
        const count = (r.vehicle_prices || []).length;
        return count > 0
          ? <span className="text-xs text-accent">{count} type{count !== 1 ? 's' : ''} configured</span>
          : <span className="text-xs text-gray-500">Default only</span>;
      },
    },
    { key: 'products_count', header: 'Products', render: (r) => (r.products || []).length },
    { key: 'employees_count', header: 'Employees', render: (r) => (r.employees || []).length },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setModal({ mode: 'edit', data: r })} className="p-1.5 text-gray-400 hover:text-accent">
            <Pencil size={14} />
          </button>
          <button onClick={() => setConfirmDel(r)} className="p-1.5 text-gray-400 hover:text-red-400">
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Services"
        subtitle="Service catalog with products and assigned employees"
        actions={<Button onClick={() => setModal({ mode: 'create' })}><Plus size={16} /> Add Service</Button>}
      />

      <div className="bg-bg-card border border-border rounded-xl p-4 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input
            placeholder="Search services by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : services.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No services yet"
          message={search ? 'Try a different search.' : 'Create your first service.'}
          action={<Button onClick={() => setModal({ mode: 'create' })}><Plus size={16} /> Add Service</Button>}
        />
      ) : (
        <>
          <div className="hidden xl:block">
            <Table columns={columns} rows={services} onRowClick={(r) => navigate(`/services/${r.id}`)} />
          </div>
          <div className="flex flex-col gap-2 xl:hidden">
            {services.map((r) => (
              <div key={r.id} className="bg-bg-card border border-border rounded-xl p-3 cursor-pointer hover:border-accent/40 transition-colors" onClick={() => navigate(`/services/${r.id}`)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-100 truncate">{r.service_name}</div>
                    <code className="text-[10px] text-gray-500 bg-bg-elev px-1.5 py-0.5 rounded mt-1 inline-block">{r.service_code}</code>
                  </div>
                  <div className="text-sm font-bold text-gray-100 shrink-0">₹{Number(r.service_price).toLocaleString('en-IN')}</div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {r.reduces_stock && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-900/30 text-emerald-300 border border-emerald-700/40">Stock reduction</span>}
                  {r.has_warranty && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-sky-900/30 text-sky-300 border border-sky-700/40">Warranty{r.warranty_months ? ` ${r.warranty_months}m` : ''}</span>}
                  {(r.vehicle_prices || []).length > 0 && <span className="text-[10px] text-accent">{r.vehicle_prices.length} vehicle type{r.vehicle_prices.length !== 1 ? 's' : ''}</span>}
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                  <div className="flex gap-3 text-[10px] text-gray-500">
                    <span>{(r.products || []).length} product{(r.products || []).length !== 1 ? 's' : ''}</span>
                    <span>{(r.employees || []).length} employee{(r.employees || []).length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setModal({ mode: 'edit', data: r })} className="p-1.5 text-gray-400 hover:text-accent"><Pencil size={14} /></button>
                    <button onClick={() => setConfirmDel(r)} className="p-1.5 text-gray-400 hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <ServiceFormModal modal={modal} onClose={() => setModal(null)} onSaved={load} />
      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={onDelete}
        loading={delLoading}
        title={`Delete ${confirmDel?.service_name}?`}
        message="This service and its product/employee links will be removed."
      />
    </div>
  );
}

/* ─── Empty vehicle prices map: all 6 types with blank price ─────────────── */
function emptyVehiclePrices() {
  return Object.fromEntries(VEHICLE_PRICING_TYPES.map(t => [t.value, '']));
}

function ServiceFormModal({ modal, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    service_name: '', service_price: '', service_description: '', reduces_stock: true,
    has_warranty: false, warranty_months: '', two_wheeler_service: false, four_wheeler_service: false, other_wheeler_service: false
  });
  const [vehiclePrices, setVehiclePrices] = useState(emptyVehiclePrices());
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!modal) return;
    if (modal.mode === 'edit') {
      setForm({
        service_name: modal.data.service_name || '',
        service_price: modal.data.service_price || '',
        service_description: modal.data.service_description || '',
        reduces_stock: modal.data.reduces_stock !== false,
        has_warranty: modal.data.has_warranty || false,
        warranty_months: modal.data.warranty_months ?? '',
        two_wheeler_service: modal.data.two_wheeler_service || false,
        four_wheeler_service: modal.data.four_wheeler_service || false,
        other_wheeler_service: modal.data.other_wheeler_service || false,
      });
      // Pre-fill existing vehicle prices
      const existing = emptyVehiclePrices();
      for (const vp of modal.data.vehicle_prices || []) {
        existing[vp.vehicle_type] = String(vp.price);
      }
      setVehiclePrices(existing);
    } else {
      setForm({ service_name: '', service_price: '', service_description: '', reduces_stock: true, has_warranty: false, warranty_months: '', two_wheeler_service: false, four_wheeler_service: false, other_wheeler_service: false });
      setVehiclePrices(emptyVehiclePrices());
    }
    setErrors({});
  }, [modal]);

  const submit = async (e) => {
    e.preventDefault();
    const eMap = {};
    if (!form.service_name.trim()) eMap.service_name = 'Required';
    if (form.service_price === '' || isNaN(Number(form.service_price))) eMap.service_price = 'Valid price required';
    setErrors(eMap);
    if (Object.keys(eMap).length) return;
    setSubmitting(true);
    try {
      const payload = {
        service_name: form.service_name,
        service_price: Number(form.service_price),
        service_description: form.service_description,
        reduces_stock: form.reduces_stock,
        has_warranty: form.has_warranty,
        warranty_months: form.has_warranty && form.warranty_months !== '' ? Number(form.warranty_months) : null,
        two_wheeler_service: form.two_wheeler_service,
        four_wheeler_service: form.four_wheeler_service,
        other_wheeler_service: form.other_wheeler_service,
      };
      let savedService;
      if (modal.mode === 'edit') {
        savedService = await updateService(modal.data.id, payload);
        toast.success('Service updated');
      } else {
        savedService = await createService(payload);
        toast.success('Service created');
      }

      // Save vehicle prices (upsert filled entries, delete cleared entries)
      const serviceId = savedService?.id ?? modal.data?.id;
      const existingPrices = modal.mode === 'edit' ? (modal.data.vehicle_prices || []) : [];

      for (const { value: vtype } of VEHICLE_PRICING_TYPES) {
        const raw = vehiclePrices[vtype];
        const existing = existingPrices.find(vp => vp.vehicle_type === vtype);
        if (raw !== '' && !isNaN(Number(raw)) && Number(raw) >= 0) {
          await upsertServiceVehiclePrice(serviceId, { vehicle_type: vtype, price: Number(raw) });
        } else if (raw === '' && existing) {
          // Price was cleared — delete it
          await deleteServiceVehiclePrice(existing.id);
        }
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
      title={modal?.mode === 'edit' ? 'Edit Service' : 'Add Service'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={submitting}>{modal?.mode === 'edit' ? 'Save' : 'Create'}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        {/* Basic info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Service Name" required error={errors.service_name}>
            <Input value={form.service_name} onChange={(e) => setForm({ ...form, service_name: e.target.value })} />
          </Field>
          <Field label="Default Price (₹)" required error={errors.service_price}>
            <Input type="number" step="0.01" value={form.service_price} onChange={(e) => setForm({ ...form, service_price: e.target.value })} />
          </Field>

          {/* Stock Reduction toggle */}
          <div className="flex flex-col justify-center">
            <label className="block text-xs font-medium text-gray-400 mb-2">Stock Reduction</label>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, reduces_stock: !f.reduces_stock }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${form.reduces_stock ? 'bg-accent' : 'bg-gray-700'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.reduces_stock ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <p className="text-xs text-gray-500 mt-1">
              {form.reduces_stock ? 'Reduces inventory when used' : 'Does not reduce inventory'}
            </p>
          </div>

          {/* Warranty toggle */}
          <div className="flex flex-col justify-center">
            <label className="block text-xs font-medium text-gray-400 mb-2">Warranty</label>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, has_warranty: !f.has_warranty, warranty_months: !f.has_warranty ? f.warranty_months : '' }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${form.has_warranty ? 'bg-sky-500' : 'bg-gray-700'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.has_warranty ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <p className="text-xs text-gray-500 mt-1">
              {form.has_warranty ? 'Service includes warranty' : 'No warranty'}
            </p>
          </div>
          {/* Two Wheeler Toggle */}
          <div className='flex flex-col justify-center'>
            <label className="block text-xs font-medium text-gray-400 mb-2">Two Wheelers</label>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, two_wheeler_service: !f.two_wheeler_service }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${form.two_wheeler_service ? 'bg-sky-500' : 'bg-gray-700'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.two_wheeler_service ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>


          {/* Four Wheeler Toggle */}
          <div className='flex flex-col justify-center'>
            <label className="block text-xs font-medium text-gray-400 mb-2">Four Wheelers</label>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, four_wheeler_service: !f.four_wheeler_service }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${form.four_wheeler_service ? 'bg-sky-500' : 'bg-gray-700'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.four_wheeler_service ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>


          {/* Two Wheeler Toggle */}
          <div className='flex flex-col justify-center'>
            <label className="block text-xs font-medium text-gray-400 mb-2">Other Wheelers</label>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, other_wheeler_service: !f.other_wheeler_service }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${form.other_wheeler_service ? 'bg-sky-500' : 'bg-gray-700'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.other_wheeler_service ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>


          {/* Warranty months (only when warranty is on) */}
          {form.has_warranty && (
            <Field label="Warranty Duration (months)">
              <Input
                type="number"
                min="1"
                step="1"
                placeholder="e.g. 6"
                value={form.warranty_months}
                onChange={(e) => setForm(f => ({ ...f, warranty_months: e.target.value }))}
              />
            </Field>
          )}

          <div className="md:col-span-2">
            <Field label="Description">
              <Textarea value={form.service_description} onChange={(e) => setForm({ ...form, service_description: e.target.value })} />
            </Field>
          </div>
        </div>

        {/* Vehicle-type pricing */}
        <div>
          <p className="text-xs font-semibold text-gray-300 mb-1">Vehicle-Type Pricing</p>
          <p className="text-xs text-gray-500 mb-3">Leave blank to use the default price for that vehicle type. Clear a price to remove it.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {VEHICLE_PRICING_TYPES.map(({ value, label }) => (
              <Field key={value} label={label}>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="₹ (optional)"
                  value={vehiclePrices[value]}
                  onChange={(e) => setVehiclePrices(prev => ({ ...prev, [value]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}
