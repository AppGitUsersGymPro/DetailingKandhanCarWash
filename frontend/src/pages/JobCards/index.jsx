import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, ClipboardList, Filter, Search, ChevronRight, Pencil, FileText, Warehouse } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import Badge from '../../components/Badge';
import EmptyState from '../../components/EmptyState';
import Table from '../../components/Table';
import { Input, Select } from '../../components/Field';
import SearchableSelect from '../../components/SearchableSelect';
import { useToast } from '../../components/Toast';
import { listJobCards, listJobCardsByType, getCustomerTiers, listGarageGroups } from '../../api/jobcards';
import { listVehicleCompanies, listVehicleModels } from '../../api/customers';
import { listEmployees } from '../../api/employees';
import { extractError } from '../../api/axios';
import { jobCardTotal, openWhatsAppForJobCard } from '../../utils/jobcard';
import { downloadJobCardInvoice } from '../../utils/invoice';
import { downloadGarageInvoice } from '../../utils/garageInvoice';

const WaIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

/* ─── Stat card definitions ─────────────────────────────────────────────────
   img   → Unsplash photo URL (loaded via <img> tag so onError works reliably)
   fallback → CSS gradient shown when photo fails / while loading
   accent   → badge / hover glow colour
   statKey  → maps to stats state object key
   route    → optional — makes card a clickable button navigating there
────────────────────────────────────────────────────────────────────────────── */
/* ─── Local image paths ─────────────────────────────────────────────────────
   Place the image files in:  frontend/public/images/
   File names expected:
     two-wheeler.jpg    – photo of a motorcycle / scooter
     four-wheeler.jpg   – photo of a car / SUV
     other-vehicle.jpg  – heavy / commercial vehicle
     workshop.jpg       – photo of a car-detailing workshop / garage
     completed.jpg      – photo of a freshly-detailed / clean car
   The gradient fallback is always shown until the image loads.
────────────────────────────────────────────────────────────────────────────── */
const STAT_CARDS = [
  {
    key: 'two_wheeler',
    label: 'Two Wheelers',
    sub: 'Bikes & Scooters',
    statKey: 'twoWheeler',
    route: '/jobcards/by-vehicle/two_wheeler',
    img: '/images/two-wheeler.jpg',
    fallback: 'linear-gradient(145deg,#1e1b4b 0%,#4c1d95 100%)',
    accent: '#a78bfa',
  },
  {
    key: 'four_wheeler',
    label: 'Four Wheelers',
    sub: 'Cars & SUVs',
    statKey: 'fourWheeler',
    route: '/jobcards/by-vehicle/four_wheeler',
    img: '/images/four-wheeler.jpg',
    fallback: 'linear-gradient(145deg,#082f49 0%,#0369a1 100%)',
    accent: '#38bdf8',
  },
  {
    key: 'other',
    label: 'Others',
    sub: 'Heavy / Commercial',
    statKey: 'other',
    route: '/jobcards/by-vehicle/other',
    img: '/images/other-vehicle.jpg',
    fallback: 'linear-gradient(145deg,#1a2e05 0%,#3f6212 100%)',
    accent: '#86efac',
  },
  {
    key: 'active',
    label: 'In Progress',
    sub: 'Being serviced now',
    statKey: 'active',
    route: '/jobcards/by-status/IN_PROGRESS',
    img: '/images/workshop.jpg',
    fallback: 'linear-gradient(145deg,#422006 0%,#a16207 100%)',
    accent: '#facc15',
  },
  {
    key: 'completed',
    label: 'Completed',
    sub: 'Jobs finished',
    statKey: 'completed',
    route: '/jobcards/by-status/COMPLETED',
    img: '/images/completed.jpg',
    fallback: 'linear-gradient(145deg,#052e16 0%,#15803d 100%)',
    accent: '#34d399',
  },
];
import { AddPaymentModal } from './Detail';

/* Payment status badge config */
const PAY_STATUS = {
  paid: { label: 'Paid', cls: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50' },
  partial: { label: 'Partial', cls: 'bg-yellow-900/30 text-yellow-300 border-yellow-700/50' },
  unpaid: { label: 'Unpaid', cls: 'bg-red-900/30 text-red-300 border-red-700/50' },
};

export default function JobCardsList() {
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [usageFilter, setUsageFilter] = useState(''); // '' | 'complete' | 'incomplete'
  const [paymentFilter, setPaymentFilter] = useState(''); // '' | 'paid' | 'partial' | 'unpaid'
  const [ownerTypeFilter, setOwnerTypeFilter] = useState(''); // '' | 'customer' | 'garage'
  const [employees, setEmployees] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [models, setModels] = useState([]);
  const [stats, setStats] = useState({ active: 0, completed: 0, twoWheeler: 0, fourWheeler: 0, other: 0 });
  const [payJobCard, setPayJobCard] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tiers, setTiers] = useState({ high_value: [], frequent: [] });

  // Load employees + companies + tiers once
  useEffect(() => {
    listEmployees().then(d => setEmployees(Array.isArray(d) ? d : (d.results || []))).catch(() => { });
    listVehicleCompanies({}).then(d => setCompanies(Array.isArray(d) ? d : [])).catch(() => { });
    getCustomerTiers().then(setTiers).catch(() => { });
  }, []); // eslint-disable-line

  // Reload models when company filter changes
  useEffect(() => {
    if (!companyFilter) { setModels([]); return; }
    listVehicleModels({ company: companyFilter }).then(d => setModels(Array.isArray(d) ? d : [])).catch(() => { });
  }, [companyFilter]);

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      try {
        const params = {};
        if (statusFilter) params.status = statusFilter;
        if (dateFilter) params.date = dateFilter;
        if (employeeFilter) params.employee = employeeFilter;
        if (companyFilter) params.company = companyFilter;
        if (modelFilter) params.model = modelFilter;
        if (ownerTypeFilter) params.owner_type = ownerTypeFilter;

        const [jobsData, twoWheeler, fourWheeler, otherVehicle, active, completed] =
          await Promise.all([
            listJobCards(Object.keys(params).length ? params : undefined),
            // listJobCardsByType('two_wheeler'),
            // listJobCardsByType('four_wheeler'),
            // listJobCardsByType('other'),
            // listJobCards({ status: 'IN_PROGRESS' }),
            // listJobCards({ status: 'COMPLETED' }),
          ]);
        setJobs(Array.isArray(jobsData) ? jobsData : (jobsData.results || []));
        setStats({
          twoWheeler: jobsData.filter(j => j.vehicle_type === "two_wheeler").length,
          fourWheeler: jobsData.filter(j => j.vehicle_type === "four_wheeler").length,
          other: jobsData.filter(j => j.vehicle_type === "other_wheeler").length,
          active: jobsData.filter(j => j.job_card_status === "IN_PROGRESS").length,
          completed: jobsData.filter(j => j.vehicle_type === "COMPLETED").length,
        });
      } catch (err) {
        toast.error(extractError(err));
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, [statusFilter, dateFilter, employeeFilter, companyFilter, modelFilter, ownerTypeFilter, refreshKey]); // eslint-disable-line

  const filtered = useMemo(() => {
    let list = jobs;
    if (usageFilter === 'complete') list = list.filter(j => j.usage_complete === true);
    if (usageFilter === 'incomplete') list = list.filter(j => j.usage_complete === false);
    if (paymentFilter) list = list.filter(j => j.payment_status === paymentFilter);
    if (!search.trim()) return list;
    const s = search.toLowerCase();
    return list.filter((j) =>
      (j.job_card_number || '').toLowerCase().includes(s) ||
      (j.customer_name || '').toLowerCase().includes(s) ||
      (j.vehicle_number || '').toLowerCase().includes(s) ||
      (j.vehicle_company || '').toLowerCase().includes(s) ||
      (j.vehicle_model || '').toLowerCase().includes(s)
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
      render: (r) => (
        <div className="leading-tight">
          {r.garage_name ? (
            <>
              <div className="text-sky-300 font-medium">{r.garage_name}</div>
              <div className="text-[10px] text-sky-600 mt-0.5">Garage</div>
            </>
          ) : (
            <>
              <div className="text-gray-200">{r.customer_name}</div>
              {r.phone_number && <div className="text-[10px] text-gray-500 mt-0.5">{r.phone_number}</div>}
            </>
          )}
        </div>
      ),
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
      key: 'total_price',
      header: 'Total / Due',
      render: (r) => {
        const total = r.total_amount
        //const due = Number(r.outstanding || 0);
        return (
          <div className="leading-tight">
            <div className="text-gray-100 font-medium">₹{total.toLocaleString('en-IN')}</div>
            {/* {due > 0 && (
              <div className="text-[11px] text-yellow-400 mt-0.5">
                ₹{due.toLocaleString('en-IN', { minimumFractionDigits: 2 })} due
              </div>
            )} */}
          </div>
        );
      },
    },
    {
      key: 'job_card_status',
      header: 'Job Status',
      render: (r) => {
        const hasCompletedSvcs = (r.job_card_services || []).some(s => s.service_status === 'completed');
        return (
          <div className="leading-tight space-y-1">
            <Badge variant={r.job_card_status === 'COMPLETED' ? 'green' : 'yellow'}>
              {r.job_card_status === 'COMPLETED' ? 'Completed' : 'In Progress'}
            </Badge>
            {hasCompletedSvcs && (
              r.usage_complete
                ? <div className="text-[10px] text-emerald-400 flex items-center gap-0.5">✓ Usages marked</div>
                : <div className="text-[10px] text-amber-400 flex items-center gap-0.5">⚠ Usages pending</div>
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
      render: (r) => {
        const isHV = tiers.high_value.some(t => t.id === r.customer_id);
        const isFQ = !isHV && tiers.frequent.some(t => t.id === r.customer_id);
        return (
          <div className="flex items-center gap-1.5">
            {isHV && (
              <span title="High-Value Customer" className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold bg-violet-900/50 text-violet-300 border border-violet-600/50 shrink-0">
                H
              </span>
            )}
            {isFQ && (
              <span title="Frequent Visitor" className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold bg-cyan-900/50 text-cyan-300 border border-cyan-600/50 shrink-0">
                F
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => { e.stopPropagation(); downloadJobCardInvoice(r); }}
              title="Download invoice"
            >
              <FileText size={13} />
            </Button>
            {r.phone_number && (
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => { e.stopPropagation(); openWhatsAppForJobCard(r, toast); }}
                title="Send on WhatsApp"
                className="text-green-500 hover:text-green-400"
              >
                <WaIcon />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => { e.stopPropagation(); navigate(`/jobcards/${r.id}/edit`); }}
              title="Edit job card"
            >
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
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Job Cards"
        subtitle="Track every vehicle that comes through your workshop"
        actions={
          <Link to="/jobcards/new">
            <Button><Plus size={16} /> New Job Card</Button>
          </Link>
        }
      />

      {/* ── 5 photo stat cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 mb-4">
        {STAT_CARDS.map((card) => (
          <PhotoStatCard
            key={card.key}
            label={card.label}
            sub={card.sub}
            value={stats[card.statKey]}
            img={card.img}
            fallback={card.fallback}
            accent={card.accent}
            onClick={card.route ? () => navigate(card.route) : null}
          />
        ))}
      </div>

      {/* ── Owner type quick filter ─────────────────────────────────────── */}
      <div className="flex items-center gap-1 mb-3 bg-bg-card border border-border rounded-xl px-4 py-3">
        <span className="text-xs text-gray-500 mr-2 font-medium">Show:</span>
        {[
          { v: '', label: 'All' },
          { v: 'customer', label: 'Customers' },
          { v: 'garage', label: 'Garage' },
        ].map(({ v, label }) => (
          <button
            key={v}
            type="button"
            onClick={() => setOwnerTypeFilter(v)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${ownerTypeFilter === v
              ? 'bg-accent text-white'
              : 'text-gray-400 hover:text-gray-200 hover:bg-bg-hover'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Search / Filter ─────────────────────────────────────────────── */}
      <div className="bg-bg-card border border-border rounded-xl p-4 mb-4 space-y-3">
        {/* Row 1: search — full width */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input
            placeholder="Search by job card #, customer, vehicle, or company"
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
        {/* Row 3: employee + company + model + usage + payment */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
        {(dateFilter || employeeFilter || companyFilter || modelFilter || statusFilter || usageFilter || paymentFilter) && (
          <div>
            <button
              type="button"
              onClick={() => { setDateFilter(''); setEmployeeFilter(''); setCompanyFilter(''); setModelFilter(''); setStatusFilter(''); setUsageFilter(''); setPaymentFilter(''); }}
              className="text-xs text-gray-400 hover:text-gray-200 underline"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Payment modal — outside filter bar so it renders correctly */}
      <AddPaymentModal
        open={!!payJobCard}
        onClose={() => setPayJobCard(null)}
        jobCardId={payJobCard?.id}
        outstanding={payJobCard?.outstanding}
        totalAmount={payJobCard?.total_amount}
        jobCard={payJobCard}
        onAdded={() => setRefreshKey(k => k + 1)}
      />

      {ownerTypeFilter === 'garage' ? (
        <GarageGroupsView
          statusFilter={statusFilter}
          dateFilter={dateFilter}
          employeeFilter={employeeFilter}
          refreshTrigger={refreshKey}
        />
      ) : loading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No job cards found"
          message={
            search || statusFilter
              ? 'Try adjusting your filters.'
              : 'Get started by creating your first job card.'
          }
          action={
            <Link to="/jobcards/new">
              <Button><Plus size={16} /> New Job Card</Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* Desktop: table */}
          <div className="hidden xl:block">
            <Table
              columns={columns}
              rows={filtered}
              onRowClick={(r) => navigate(`/jobcards/${r.id}`)}
            />
          </div>
          {/* Mobile / tablet: card grid */}
          <div className="grid grid-cols-1 gap-3 xl:hidden">
            {filtered.map((r) => (
              <JobCardGridCard
                key={r.id}
                r={r}
                navigate={navigate}
                toast={toast}
                tiers={tiers}
                setPayJobCard={setPayJobCard}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Mobile / tablet card for a single job card row ────────────────────────*/
function JobCardGridCard({ r, navigate, toast, tiers, setPayJobCard }) {
  const payCfg = PAY_STATUS[r.payment_status] || PAY_STATUS.unpaid;
  const isHV = tiers.high_value.some(t => t.id === r.customer_id);
  const isFQ = !isHV && tiers.frequent.some(t => t.id === r.customer_id);
  const hasCompletedSvcs = (r.job_card_services || []).some(s => s.service_status === 'completed');

  return (
    <div
      className="bg-bg-card border border-border rounded-xl p-3 cursor-pointer hover:border-accent/40 transition-colors flex flex-col gap-2"
      onClick={() => navigate(`/jobcards/${r.id}`)}
    >
      {/* Row 1: JC# + date + payment badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-bold text-accent shrink-0">{r.job_card_number}</span>
          <span className="text-xs text-gray-500">{r.job_card_date}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isHV && <span title="High-Value Customer" className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-extrabold bg-violet-900/50 text-violet-300 border border-violet-600/50">H</span>}
          {isFQ && <span title="Frequent Visitor" className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-extrabold bg-cyan-900/50 text-cyan-300 border border-cyan-600/50">F</span>}
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${payCfg.cls}`}>{payCfg.label}</span>
        </div>
      </div>

      {/* Row 2: Customer | Vehicle | Total (3 cols) */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="min-w-0">
          {r.garage_name
            ? <div className="text-sky-300 font-medium truncate">{r.garage_name}</div>
            : <div className="text-gray-200 font-medium truncate">{r.customer_name}</div>}
          {r.phone_number && <div className="text-gray-500 text-[10px] truncate">{r.phone_number}</div>}
        </div>
        <div className="min-w-0">
          <div className="text-sky-300 font-semibold truncate">{r.vehicle_number}</div>
          {(r.vehicle_company || r.vehicle_model) && (
            <div className="text-gray-500 text-[10px] truncate">{[r.vehicle_company, r.vehicle_model].filter(Boolean).join(' · ')}</div>
          )}
        </div>
        <div className="min-w-0 text-right">
          <div className="text-gray-100 font-semibold">₹{Number(r.total_amount || 0).toLocaleString('en-IN')}</div>
          <div className="text-gray-500 text-[10px] truncate">{r.employee_name || '—'}</div>
        </div>
      </div>

      {/* Row 3: statuses + action buttons */}
      <div className="flex items-center gap-1.5 pt-1.5 border-t border-border" onClick={e => e.stopPropagation()}>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${r.job_card_status === 'COMPLETED' ? 'text-emerald-400 bg-emerald-900/30 border-emerald-700/50' : 'text-yellow-400 bg-yellow-900/30 border-yellow-700/50'}`}>
          {r.job_card_status === 'COMPLETED' ? 'Done' : 'In Progress'}
        </span>
        {hasCompletedSvcs && (r.usage_complete
          ? <span className="text-[10px] text-emerald-400 shrink-0">✓ Usage</span>
          : <span className="text-[10px] text-amber-400 shrink-0">⚠ Usage</span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <button onClick={e => { e.stopPropagation(); downloadJobCardInvoice(r); }} className="p-1 text-gray-500 hover:text-blue-400 transition-colors" title="Download invoice"><FileText size={14} /></button>
          {r.phone_number && (
            <button onClick={e => { e.stopPropagation(); openWhatsAppForJobCard(r, toast); }} className="p-1 text-gray-500 hover:text-green-400 transition-colors" title="WhatsApp"><WaIcon /></button>
          )}
          <button onClick={e => { e.stopPropagation(); navigate(`/jobcards/${r.id}/edit`); }} className="p-1 text-gray-500 hover:text-gray-200 transition-colors" title="Edit"><Pencil size={14} /></button>
          <button
            onClick={e => { e.stopPropagation(); setPayJobCard(r); }}
            className={`ml-1 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${r.payment_status === 'paid' ? 'text-gray-400 border-border hover:bg-bg-hover' : 'text-white bg-accent border-accent hover:bg-accent/80'}`}
          >
            {r.payment_status === 'paid' ? 'View' : 'Pay Now'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Garage Groups View ─────────────────────────────────────────────────────
   Shown in place of the regular table when ownerTypeFilter === 'garage'.
   Each row is a clickable card that navigates to the garage detail page.
────────────────────────────────────────────────────────────────────────────── */
function GarageGroupsView({ statusFilter, dateFilter, employeeFilter, refreshTrigger }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (statusFilter) params.status = statusFilter;
    if (dateFilter) params.date = dateFilter;
    if (employeeFilter) params.employee = employeeFilter;
    listGarageGroups(params)
      .then(d => setGroups(Array.isArray(d) ? d : (d.results || [])))
      .catch(err => toast.error(extractError(err)))
      .finally(() => setLoading(false));
  }, [statusFilter, dateFilter, employeeFilter, refreshTrigger]); // eslint-disable-line

  const filtered = useMemo(() => {
    if (!search.trim()) return groups;
    const s = search.toLowerCase();
    return groups.filter(g =>
      (g.garage_name || '').toLowerCase().includes(s) ||
      (g.garage_phone || '').toLowerCase().includes(s)
    );
  }, [groups, search]);

  if (loading) return <Loading />;
  if (!filtered.length) return (
    <EmptyState
      icon={Warehouse}
      title="No garage job cards found"
      message="No job cards linked to garage owners match the current filters."
    />
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          className="w-full bg-bg-card border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-accent/40"
          placeholder="Search garage by name or phone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {filtered.map(group => {
        const outstanding = Number(group.outstanding || 0);
        const payStatus = PAY_STATUS[group.payment_status] || PAY_STATUS.unpaid;

        return (
          <div
            key={group.garage_id}
            className="bg-bg-card border border-border rounded-xl overflow-hidden hover:border-accent/40 hover:bg-bg-hover/30 transition-colors cursor-pointer group"
            onClick={() => navigate(`/jobcards/garage/${group.garage_id}`, { state: { group } })}
          >
            <div className="flex items-center gap-3 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sky-300 group-hover:text-sky-200 transition-colors">
                    {group.garage_name}
                  </span>
                  {group.garage_phone && (
                    <span className="text-xs text-gray-500">{group.garage_phone}</span>
                  )}
                  {group.garage_location && (
                    <span className="text-xs text-gray-600">{group.garage_location}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 flex-wrap text-[11px] text-gray-500">
                  <span>{group.job_card_count} vehicle{group.job_card_count !== 1 ? 's' : ''}</span>
                  <span className="text-emerald-400">{group.completed_count} done</span>
                  {group.in_progress_count > 0 && (
                    <span className="text-yellow-400">{group.in_progress_count} in progress</span>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="font-semibold text-gray-100">
                  ₹{Number(group.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                {outstanding > 0 && (
                  <div className="text-xs text-red-400 mt-0.5">
                    ₹{outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })} due
                  </div>
                )}
              </div>

              <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border ${payStatus.cls} shrink-0`}>
                {payStatus.label}
              </span>

              <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => downloadGarageInvoice(group)}
                  title="Download group invoice"
                >
                  <FileText size={13} />
                </Button>
              </div>

              <ChevronRight size={15} className="text-gray-600 group-hover:text-gray-400 shrink-0 transition-colors" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Unified photo stat card ────────────────────────────────────────────────
   Uses a real <img> tag so the browser fires onError on broken URLs.
   The gradient fallback div sits behind the img — always visible until/unless
   the photo loads; permanently visible if the URL fails.
────────────────────────────────────────────────────────────────────────────── */
function PhotoStatCard({ label, sub, value, img, fallback, accent, onClick }) {
  // If onClick is provided → render as <button>; otherwise → plain <div>
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick ?? undefined}
      className={[
        'relative overflow-hidden rounded-xl border border-border group text-left',
        'transition-all duration-300',
        onClick
          ? 'cursor-pointer hover:shadow-xl hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-white/20'
          : 'cursor-default',
      ].join(' ')}
      style={{ aspectRatio: '1 / 1.05', minHeight: '130px' }}
    >
      {/* ① Gradient fallback — always behind the photo */}
      <div className="absolute inset-0" style={{ background: fallback }} />

      {/* ② Real photo — <img> with onError so broken URLs degrade cleanly */}
      <img
        src={img}
        alt={label}
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-110"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />

      {/* ③ Dark gradient — so text is always readable */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.87) 0%, rgba(0,0,0,0.42) 55%, rgba(0,0,0,0.14) 100%)',
        }}
      />

      {/* ④ Accent glow on hover */}
      {onClick && (
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at 50% 110%, ${accent}30 0%, transparent 65%)` }}
        />
      )}

      {/* ⑤ Content */}
      <div className="absolute inset-0 flex flex-col justify-between p-3">
        {/* Count badge — top-right: solid black circle so it's always readable over any photo */}
        <div className="self-end">
          <span
            className="text-[12px] font-extrabold leading-none flex items-center justify-center rounded-full"
            style={{
              width: '28px',
              height: '28px',
              background: 'rgba(0,0,0,0.82)',
              color: accent,
              border: `1.5px solid ${accent}`,
              boxShadow: `0 0 8px ${accent}55`,
            }}
          >
            {value}
          </span>
        </div>

        {/* Label — bottom-left */}
        <div>
          <div className="text-[11px] font-bold text-white leading-tight tracking-wide">
            {label}
          </div>
          <div className="flex items-center gap-0.5 mt-0.5">
            <span className="text-[9px] text-white/50 leading-none">{sub}</span>
            {onClick && <ChevronRight size={8} className="text-white/40 mt-px" />}
          </div>
        </div>
      </div>
    </Tag>
  );
}
