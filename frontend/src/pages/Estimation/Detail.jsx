import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import { useToast } from '../../components/Toast';
import { getEstimation } from '../../api/estimation';
import { extractError } from '../../api/axios';
import { openWhatsAppForEstimation } from '../../utils/jobcard';
// import { JobCardCreate } from '../JobCards/Create';

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

// WhatsApp glyph — kept here so the button matches the rest of the app.
export const WaIcon = ({ size = 15 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

function Info({ label, value }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-sm text-gray-100 mt-0.5">{value || '—'}</div>
    </div>
  );
}

export default function EstimationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [est, setEst] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getEstimation(id)
      .then((data) => alive && setEst(data))
      .catch((err) => {
        toast.error(extractError(err));
        if (alive) setEst(null);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id, toast]);

  if (loading) return <Loading />;

  if (!est) {
    return (
      <div>
        <PageHeader title="Estimation" subtitle="Not found" />
        <Button variant="secondary" onClick={() => navigate('/estimation')}>
          <ArrowLeft size={15} /> Back to Estimations
        </Button>
      </div>
    );
  }

  const items = est.items || [];

  return (
    <div>
      <PageHeader
        title={`Estimation for ${est.customer_name}`}
        subtitle={fmtDateTime(est.created_at)}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigate('/estimation')}>
              <ArrowLeft size={14} /> Back
            </Button>
            <Button
              variant="success"
              size="sm"
              title="Send on WhatsApp"
              onClick={() => openWhatsAppForEstimation(est, toast)}
            >
              <WaIcon size={14} /> WhatsApp
            </Button>
            <Button size="sm" onClick={() => navigate('/jobcards/new', {
              state: {
                prefill: {
                  customer_name: est.customer_name,
                  customer_phone_number: est.customer_phone_number,
                  vehicle_name: est.vehicle_name,
                  vehicle_type: est.vehicle_type,
                  vehicle_sub_type: est.vehicle_sub_type,
                  vehicle_company: est.vehicle_company,
                  vehicle_model: est.vehicle_model,
                  vehicle_colour: est.vehicle_colour,
                  selected_service: est.items,
                }
              }
            })}>Convert to JobCard </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Customer & vehicle */}
        <div className="bg-bg-card border border-border rounded-xl p-4 sm:p-5 lg:col-span-1">
          <h2 className="text-sm font-semibold text-gray-200 mb-4">Customer &amp; Vehicle</h2>
          <div className="space-y-4">
            <Info label="Customer Name" value={est.customer_name} />
            <Info label="Phone Number" value={est.customer_phone_number} />
            <Info label="Vehicle Name" value={est.vehicle_name} />
            <Info label="Vehicle Company" value={est.vehicle_company} />
            <Info label="Vehicle Model" value={est.vehicle_model} />
            <Info label="Vehicle Colour" value={est.vehicle_colour} />
            <Info label="Vehicle Type" value={VEHICLE_LABEL[est.vehicle_type] || est.vehicle_type} />
            {est.vehicle_type === 'four_wheeler' && (
              <Info label="Vehicle Sub Type" value={est.vehicle_sub_type} />
            )}
          </div>
        </div>

        {/* Line items */}
        <div className="bg-bg-card border border-border rounded-xl p-4 sm:p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-200 mb-4">Services</h2>
          <div className="divide-y divide-border">
            {items.map((it) => (
              <div key={it.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-gray-200">{it.service_name}</span>
                <span className="text-sm text-gray-100 font-medium">{fmt(it.amount)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
            <span className="text-sm font-medium text-gray-300">Total</span>
            <span className="text-lg font-semibold text-gray-100">{fmt(est.total_amount)}</span>
          </div>
        </div>
      </div>

    </div>
  );
}
