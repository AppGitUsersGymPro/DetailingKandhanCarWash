import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ClipboardList, Pencil, Plus, Search } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import Badge from '../../components/Badge';
import EmptyState from '../../components/EmptyState';
import Table from '../../components/Table';
import { Input, Select } from '../../components/Field';
import SearchableSelect from '../../components/SearchableSelect';
import { useToast } from '../../components/Toast';
import { listJobCardsByTypeList } from '../../api/jobcards';
import { listVehicleCompanies, listVehicleModels } from '../../api/customers';
import { listEmployees } from '../../api/employees';
import { extractError } from '../../api/axios';
import { jobCardTotal } from '../../utils/jobcard';
import { downloadJobCardInvoice } from '../../utils/invoice';
import { AddPaymentModal } from './Detail';
import { FileText } from 'lucide-react';

const VEHICLE_LABELS = {
  two_wheeler:  'Two Wheelers',
  four_wheeler: 'Four Wheelers',
  other:        'Others',
};

const PAY_STATUS = {
  paid:    { label: 'Paid',    cls: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50' },
  partial: { label: 'Partial', cls: 'bg-yellow-900/30 text-yellow-300 border-yellow-700/50' },
  unpaid:  { label: 'Unpaid',  cls: 'bg-red-900/30 text-red-300 border-red-700/50' },
};

export default function JobCardsByVehicle() {
  const { vehicleType } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading]               = useState(true);
  const [jobs, setJobs]                     = useState([]);
  const [search, setSearch]                 = useState('');
  const [statusFilter, setStatusFilter]     = useState('');
  const [dateFilter, setDateFilter]         = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [companyFilter, setCompanyFilter]   = useState('');
  const [modelFilter, setModelFilter]       = useState('');
  const [paymentFilter, setPaymentFilter]   = useState('');
  const [usageFilter, setUsageFilter]       = useState('');
  const [ownerTypeFilter, setOwnerTypeFilter] = useState('');
  const [employees, setEmployees]           = useState([]);
  const [companies, setCompanies]           = useState([]);
  const [models, setModels]                 = useState([]);
  const [payJobCard, setPayJobCard]         = useState(null);
  const [refreshKey, setRefreshKey]         = useState(0);

  const label = VEHICLE_LABELS[vehicleType] || vehicleType;

  // Load employees + companies filtered by vehicle type
  useEffect(() => {
    listEmployees().then(d => setEmployees(Array.isArray(d) ? d : (d.results || []))).catch(() => {});
    listVehicleCompanies({ vehicle_type: vehicleType })
      .then(d => setCompanies(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [vehicleType]);

  // Reload models when company changes
  useEffect(() => {
    if (!companyFilter) { setModels([]); return; }
    listVehicleModels({ company: companyFilter })
      .then(d => setModels(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [companyFilter]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params = {};
        if (dateFilter)      params.date       = dateFilter;
        if (companyFilter)   params.company    = companyFilter;
        if (modelFilter)     params.model      = modelFilter;
        if (employeeFilter)  params.employee   = employeeFilter;
        if (statusFilter)    params.status     = statusFilter;
        if (ownerTypeFilter) params.owner_type = ownerTypeFilter;
        const data = await listJobCardsByTypeList(vehicleType, Object.keys(params).length ? params : undefined);
        setJobs(Array.isArray(data) ? data : (data.results || []));
      } catch (err) {
        toast.error(extractError(err));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [vehicleType, dateFilter, companyFilter, modelFilter, employeeFilter, statusFilter, ownerTypeFilter, refreshKey]); // eslint-disable-line

  const filtered = useMemo(() => {
    let list = jobs;
    if (usageFilter === 'complete')   list = list.filter(j => j.usage_complete === true);
    if (usageFilter === 'incomplete') list = list.filter(j => j.usage_complete === false);
    if (paymentFilter)                list = list.filter(j => j.payment_status === paymentFilter);
    if (!search.trim()) return list;
    const s = search.toLowerCase();
    return list.filter(j =>
      (j.job_card_number || '').toLowerCase().includes(s) ||
      (j.customer_name   || '').toLowerCase().includes(s) ||
      (j.vehicle_number  || '').toLowerCase().includes(s) ||
      (j.vehicle_company || '').toLowerCase().includes(s) ||
      (j.vehicle_model   || '').toLowerCase().includes(s)
    );
  }, [jobs, search, usageFilter, paymentFilter]);

  const columns = [
    {
      key: 'job_card_number',
      header: 'Job Card #',
      render: (r) => <span className="font-medium text-gray-100">{r.job_card_number}</span>,
    },
    {
      key: 'customer_name',
      header: 'Customer / Garage',
      render: (r) => r.garage_name
        ? <div><div className="text-sky-300 font-medium">{r.garage_name}</div><div className="text-[10px] text-sky-600 mt-0.5">Garage</div></div>
        : <div><div className="text-gray-200">{r.customer_name}</div>{r.phone_number && <div className="text-[10px] text-gray-500 mt-0.5">{r.phone_number}</div>}</div>,
    },
    {
      key: 'vehicle_number',
      header: 'Vehicle',
      render: (r) => (
        <div className="leading-tight">
          <div className="text-gray-100">{r.vehicle_number}</div>
          {(r.vehicle_company || r.vehicle_model) && (
            <div className="text-[10px] text-gray-500 mt-0.5">
              {[r.vehicle_company, r.vehicle_model, r.vehicle_colour].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'employee_name',
      header: 'Employee',
      render: (r) => r.employee_name
        ? <span className="text-gray-200">{r.employee_name}</span>
        : <span className="text-gray-600 text-xs">—</span>,
    },
    { key: 'job_card_date', header: 'Date' },
    {
      key: 'total_amount',
      header: 'Total / Due',
      render: (r) => {
        const due = Number(r.outstanding || 0);
        return (
          <div className="leading-tight">
            <div className="text-gray-100 font-medium">₹{jobCardTotal(r).toLocaleString('en-IN')}</div>
            {due > 0 && <div className="text-[11px] text-yellow-400 mt-0.5">₹{due.toLocaleString('en-IN', { minimumFractionDigits: 2 })} due</div>}
          </div>
        );
      },
    },
    {
      key: 'job_card_status',
      header: 'Job Status',
      render: (r) => {
        const hasCompleted = (r.job_card_services || []).some(s => s.service_status === 'completed');
        return (
          <div className="leading-tight space-y-1">
            <Badge variant={r.job_card_status === 'COMPLETED' ? 'green' : 'yellow'}>
              {r.job_card_status === 'COMPLETED' ? 'Completed' : 'In Progress'}
            </Badge>
            {hasCompleted && (
              r.usage_complete
                ? <div className="text-[10px] text-emerald-400">✓ Usages marked</div>
                : <div className="text-[10px] text-amber-400">⚠ Usages pending</div>
            )}
          </div>
        );
      },
    },
    {
      key: 'payment_status',
      header: 'Payment',
      render: (r) => {
        const cfg = PAY_STATUS[r.payment_status] || PAY_STATUS.unpaid;
        return (
          <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.cls}`}>
            {cfg.label}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); downloadJobCardInvoice(r); }} title="Download invoice">
            <FileText size={13} />
          </Button>
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); navigate(`/jobcards/${r.id}/edit`); }} title="Edit">
            <Pencil size={13} />
          </Button>
          <Button
            size="sm"
            onClick={(e) => { e.stopPropagation(); setPayJobCard(r); }}
            variant={r.payment_status === 'paid' ? 'secondary' : 'primary'}
          >
            {r.payment_status === 'paid' ? 'View' : 'Pay Now'}
          </Button>
        </div>
      ),
    },
  ];

  const hasServerFilter = !!(dateFilter || companyFilter || modelFilter || employeeFilter || statusFilter || ownerTypeFilter);
  const hasClientFilter = !!(usageFilter || paymentFilter);

  return (
    <div>
      <PageHeader
        title={`Job Cards — ${label}`}
        subtitle={`All job cards for ${label.toLowerCase()}`}
        actions={
          <Link to="/jobcards">
            <Button variant="secondary"><ChevronLeft size={16} /> Back to Job Cards</Button>
          </Link>
        }
      />

      {/* Owner type buttons */}
      <div className="flex items-center gap-1 mb-3 bg-bg-card border border-border rounded-xl px-4 py-3">
        <span className="text-xs text-gray-500 mr-2 font-medium">Show:</span>
        {[{ v: '', label: 'All' }, { v: 'customer', label: 'Customers' }, { v: 'garage', label: 'Garage' }].map(({ v, label: l }) => (
          <button
            key={v}
            type="button"
            onClick={() => setOwnerTypeFilter(v)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${ownerTypeFilter === v ? 'bg-accent text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-bg-hover'}`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-bg-card border border-border rounded-xl p-4 mb-4 space-y-3">
        {/* Row 1: search — full width */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input
            placeholder="Search by job card #, customer, or vehicle"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-full"
          />
        </div>
        {/* Row 2: status + date */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
          </Select>
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            title="Filter by date"
          />
        </div>

        {/* Row 3: employee + company + model */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SearchableSelect
            value={String(employeeFilter)}
            onChange={setEmployeeFilter}
            options={[
              { value: '', label: 'All Employees' },
              ...employees.map(e => ({ value: String(e.id), label: e.employee_name })),
            ]}
            placeholder="All Employees"
          />
          <SearchableSelect
            value={companyFilter}
            onChange={(v) => { setCompanyFilter(v); setModelFilter(''); }}
            options={[
              { value: '', label: 'All Companies' },
              ...companies.map(c => ({ value: c.name, label: c.name })),
            ]}
            placeholder="All Companies"
          />
          <SearchableSelect
            value={modelFilter}
            onChange={setModelFilter}
            options={[
              { value: '', label: companyFilter ? 'All Models' : 'Select company first' },
              ...models.map(m => ({ value: m.name, label: m.name })),
            ]}
            placeholder={companyFilter ? 'All Models' : 'Select company first'}
            disabled={!companyFilter}
          />
        </div>

        {/* Row 4: usage + payment */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select value={usageFilter} onChange={(e) => setUsageFilter(e.target.value)}>
            <option value="">All Usage Statuses</option>
            <option value="complete">✓ Usages Complete</option>
            <option value="incomplete">⚠ Usages Pending</option>
          </Select>
          <Select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
            <option value="">All Payment Statuses</option>
            <option value="paid">✓ Paid</option>
            <option value="partial">⚡ Partial</option>
            <option value="unpaid">✗ Unpaid</option>
          </Select>
        </div>

        {(hasServerFilter || hasClientFilter) && (
          <button
            type="button"
            onClick={() => { setDateFilter(''); setCompanyFilter(''); setModelFilter(''); setEmployeeFilter(''); setStatusFilter(''); setUsageFilter(''); setPaymentFilter(''); setOwnerTypeFilter(''); }}
            className="text-xs text-gray-400 hover:text-gray-200 underline"
          >
            Clear all filters
          </button>
        )}
      </div>

      <AddPaymentModal
        open={!!payJobCard}
        onClose={() => setPayJobCard(null)}
        jobCardId={payJobCard?.id}
        outstanding={payJobCard?.outstanding}
        totalAmount={payJobCard?.total_amount}
        jobCard={payJobCard}
        onAdded={() => setRefreshKey(k => k + 1)}
      />

      {loading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={`No ${label.toLowerCase()} job cards found`}
          message={search || hasServerFilter || hasClientFilter ? 'Try adjusting your filters.' : `No job cards for ${label.toLowerCase()} yet.`}
          action={<Link to="/jobcards/new"><Button><Plus size={16} /> New Job Card</Button></Link>}
        />
      ) : (
        <Table columns={columns} rows={filtered} onRowClick={(r) => navigate(`/jobcards/${r.id}`)} />
      )}
    </div>
  );
}
