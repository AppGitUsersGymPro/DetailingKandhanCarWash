import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Users, IndianRupee, AlertTriangle, ArrowRight, Calendar, ChevronDown, FileText } from 'lucide-react';

const DailyReport = lazy(() => import('./DailyReport'));
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import Badge from '../../components/Badge';
import { useToast } from '../../components/Toast';
import { listJobCards } from '../../api/jobcards';
import { listInventory } from '../../api/inventory';
import { getDashboardStats } from '../../api/finance';
import { extractError } from '../../api/axios';
import { tokens } from '../../api/auth';

const fmt = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Date range helpers ────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function getDateRange(filter) {
  const today = new Date();
  const todayStr = fmtDate(today);
  if (filter === 'today') {
    return { date_from: todayStr, date_to: todayStr };
  }
  if (filter === 'week') {
    const from = new Date(today);
    from.setDate(today.getDate() - 6);
    return { date_from: fmtDate(from), date_to: todayStr };
  }
  if (filter === 'month') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { date_from: fmtDate(from), date_to: todayStr };
  }
  return {};
}

const FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const toast = useToast();
  const isStaff = tokens.getRole() === 'staff';
  const [dateFilter, setDateFilter]   = useState('month');
  const [loading, setLoading]         = useState(true);
  const [stats, setStats]             = useState({ active: 0, customers: 0, revenue: 0 });
  const [recentJobs, setRecentJobs]   = useState([]);
  const [lowStock, setLowStock]       = useState([]);
  const [showReport, setShowReport]   = useState(false);

  const load = useCallback(async (filter) => {
    setLoading(true);
    try {
      const range = getDateRange(filter);

      const [active, completed, statsData, lowStockItems] = await Promise.all([
        listJobCards({ status: 'IN_PROGRESS' }),
        listJobCards({ status: 'COMPLETED', ...range }),
        getDashboardStats(range),
        listInventory({ low_stock: 'true' }),
      ]);

      const activeArr    = Array.isArray(active)        ? active        : (active.results        || []);
      const completedArr = Array.isArray(completed)     ? completed     : (completed.results     || []);
      const lowArr       = Array.isArray(lowStockItems) ? lowStockItems : (lowStockItems.results || []);

      const recent = [...activeArr, ...completedArr]
        .sort((a, b) => new Date(b.job_card_date || 0) - new Date(a.job_card_date || 0))
        .slice(0, 6);

      setStats({
        active:    activeArr.length,
        customers: statsData?.customers_served ?? 0,
        revenue:   Number(statsData?.revenue_collected ?? 0),
      });
      setRecentJobs(recent);
      setLowStock(lowArr);
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(dateFilter); }, [dateFilter, load]);

  const activeFilter = FILTERS.find(f => f.key === dateFilter);
  const revenueLabel = `Revenue Collected (${activeFilter?.label})`;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your detailing workshop"
        actions={
          <>
            {!isStaff && (
              <Link
                to="/estimation/new"
                className="inline-flex items-center gap-2 rounded-md font-medium transition-colors px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white border border-accent"
              >
                <FileText size={15} /> Add Estimation
              </Link>
            )}
            <div className="flex items-center gap-1 bg-bg-elev border border-border rounded-lg p-1 flex-wrap">
              <Calendar size={13} className="text-gray-500 ml-1 shrink-0" />
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setDateFilter(f.key)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    dateFilter === f.key
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={ClipboardList} label="Active Job Cards"          value={stats.active}     accent="yellow" loading={loading} />
        <StatCard icon={Users}         label={`Customers Served (${activeFilter?.label})`} value={stats.customers} accent="blue" loading={loading} />
        <StatCard icon={IndianRupee}   label={revenueLabel}               value={fmt(stats.revenue)} accent="green"  loading={loading} />
        <StatCard icon={AlertTriangle} label="Low Stock Alerts"           value={lowStock.length}    accent="red"    loading={loading} />
      </div>

      {/* Daily Closing Report — lazy-mounted on demand */}
      <div className="mb-6">
        <button
          onClick={() => setShowReport(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-bg-card border border-border rounded-xl text-sm font-medium text-gray-300 hover:text-gray-100 hover:bg-bg-hover transition-colors"
        >
          <span>Daily Closing Report</span>
          <ChevronDown size={15} className={`transition-transform ${showReport ? 'rotate-180' : ''}`} />
        </button>
        {showReport && (
          <div className="mt-3">
            <Suspense fallback={<div className="py-10 text-center text-sm text-gray-500">Loading report…</div>}>
              <DailyReport />
            </Suspense>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">

        {/* Recent Job Cards */}
        <div className="lg:col-span-2 bg-bg-card border border-border rounded-xl">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-100">Recent Job Cards</h2>
              {dateFilter !== 'all' && (
                <p className="text-xs text-gray-500 mt-0.5">{activeFilter?.label}</p>
              )}
            </div>
            <Link to="/jobcards" className="text-xs text-accent hover:underline flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>

          {loading ? (
            <Loading />
          ) : recentJobs.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No job cards"
              message={`No job cards found for ${activeFilter?.label.toLowerCase()}.`}
            />
          ) : (
            <div className="divide-y divide-border">
              {recentJobs.map((j) => (
                <Link
                  to={`/jobcards/${j.id}`}
                  key={j.id}
                  className="flex items-center justify-between px-4 sm:px-5 py-3 hover:bg-bg-hover transition-colors gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-100 truncate">{j.job_card_number}</div>
                    <div className="text-xs text-gray-400 truncate">
                      {j.customer_name || '—'} · {j.vehicle_number || '—'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <span className="text-xs text-gray-400 hidden sm:inline">{j.job_card_date}</span>
                    <Badge variant={j.job_card_status === 'COMPLETED' ? 'green' : 'yellow'}>
                      {j.job_card_status === 'COMPLETED' ? 'Done' : 'Active'}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Low Stock */}
        <div className="bg-bg-card border border-border rounded-xl">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-100">Low Stock Alerts</h2>
            <Link to="/vendors/inventory" className="text-xs text-accent hover:underline flex items-center gap-1">
              Inventory <ArrowRight size={12} />
            </Link>
          </div>
          {loading ? (
            <Loading />
          ) : lowStock.length === 0 ? (
            <EmptyState icon={AlertTriangle} title="All stocked up" message="No items below threshold." />
          ) : (
            <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
              {lowStock.map((item) => (
                <div key={item.id} className="px-5 py-3">
                  <div className="text-sm font-medium text-red-300">{item.product_name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {item.quantity_available} {item.unit} available · threshold {item.minimum_threshold}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
