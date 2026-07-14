import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import Table from '../../components/Table';
import Badge from '../../components/Badge';
import { useToast } from '../../components/Toast';
import { listEstimations } from '../../api/estimation';
import { extractError } from '../../api/axios';

const PAGE_SIZE = 20;

const fmt = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const VEHICLE_LABEL = {
  two_wheeler: 'Two Wheeler',
  three_wheeler: 'Three Wheeler',
  four_wheeler: 'Four Wheeler',
  others: 'Others',
};

const fmtDateTime = (s) =>
  s
    ? new Date(s).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export default function Estimation() {
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const load = useCallback(
    async (p) => {
      setLoading(true);
      try {
        const data = await listEstimations({ page: p, page_size: PAGE_SIZE });
        if (Array.isArray(data)) {
          setRows(data);
          setCount(data.length);
        } else {
          setRows(data.results || []);
          setCount(data.count ?? (data.results || []).length);
        }
      } catch (err) {
        toast.error(extractError(err));
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    load(page);
  }, [page, load]);

  const columns = [
    {
      key: 'created_at',
      header: 'Date',
      render: (r) => <span className="text-gray-300 whitespace-nowrap">{fmtDateTime(r.created_at)}</span>,
    },
    {
      key: 'customer_name',
      header: 'Customer',
      render: (r) => (
        <div className="leading-tight">
          <div className="text-gray-100 font-medium">{r.customer_name}</div>
          <div className="text-[10px] text-gray-500 mt-0.5">{r.customer_phone_number}</div>
        </div>
      ),
    },
    {
      key: 'vehicle_name',
      header: 'Vehicle',
      render: (r) => (
        <div className="leading-tight">
          <div className="text-gray-200">{r.vehicle_name || '—'}</div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            {VEHICLE_LABEL[r.vehicle_type] || r.vehicle_type}
          </div>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Services',
      render: (r) => (
        <Badge variant="blue">{(r.items || []).length} item{(r.items || []).length !== 1 ? 's' : ''}</Badge>
      ),
    },
    {
      key: 'total_amount',
      header: 'Total',
      render: (r) => <span className="font-semibold text-gray-100">{fmt(r.total_amount)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Estimations"
        subtitle="Quick price estimates prepared for customers"
        actions={
          <Link to="/estimation/new">
            <Button><Plus size={16} /> Add Estimation</Button>
          </Link>
        }
      />

      {loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No estimations yet"
          message="Create your first estimation to share a price quote with a customer."
          action={
            <Link to="/estimation/new">
              <Button><Plus size={16} /> Add Estimation</Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block">
            <Table
              columns={columns}
              rows={rows}
              onRowClick={(r) => navigate(`/estimation/${r.id}`)}
            />
          </div>

          {/* Mobile cards */}
          <div className="grid grid-cols-1 gap-3 sm:hidden">
            {rows.map((r) => (
              <div
                key={r.id}
                onClick={() => navigate(`/estimation/${r.id}`)}
                className="bg-bg-card border border-border rounded-xl p-3 cursor-pointer hover:border-accent/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-100 truncate">{r.customer_name}</span>
                  <span className="text-sm font-semibold text-gray-100 shrink-0">{fmt(r.total_amount)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-1 text-xs text-gray-500">
                  <span className="truncate">
                    {r.vehicle_name ? `${r.vehicle_name} · ` : ''}
                    {VEHICLE_LABEL[r.vehicle_type] || r.vehicle_type}
                  </span>
                  <span className="shrink-0">{fmtDateTime(r.created_at)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between gap-3 mt-4">
            <span className="text-xs text-gray-500">
              {count} estimation{count !== 1 ? 's' : ''} · Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={14} /> Prev
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
