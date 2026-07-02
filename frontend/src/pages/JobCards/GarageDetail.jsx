import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ChevronLeft, FileText, CreditCard,
  CheckCircle2, Clock, Wrench, User, IndianRupee,
} from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Button from '../../components/Button';
import Badge from '../../components/Badge';
import Loading from '../../components/Loading';
import { Input, Select } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { getGarageGroup, createGaragePayment } from '../../api/jobcards';
import UpiQr from '../../components/UpiQr';
import { extractError } from '../../api/axios';
import { downloadJobCardInvoice } from '../../utils/invoice';
import { downloadGarageInvoice } from '../../utils/garageInvoice';

const INR = '₹';

const fmt = (n) =>
  `${INR}${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PAY_STATUS = {
  paid: { label: 'Paid', cls: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50' },
  partial: { label: 'Partial', cls: 'bg-yellow-900/30 text-yellow-300 border-yellow-700/50' },
  unpaid: { label: 'Unpaid', cls: 'bg-red-900/30 text-red-300 border-red-700/50' },
};

export default function GarageDetail() {
  const { garageId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [group, setGroup] = useState(location.state?.group || null);
  const [loading, setLoading] = useState(!location.state?.group);
  const [payModal, setPayModal] = useState(false);

  const load = () => {
    setLoading(true);
    getGarageGroup(garageId)
      .then(d => { if (d) setGroup(d); else toast.error('Garage not found'); })
      .catch(err => toast.error(extractError(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [garageId]);

  const { pending, paid } = useMemo(() => {
    if (!group) return { pending: [], paid: [] };
    const cards = group.job_cards || [];
    return {
      pending: cards.filter(jc => jc.payment_status !== 'paid'),
      paid: cards.filter(jc => jc.payment_status === 'paid'),
    };
  }, [group]);

  if (loading && !group) return <Loading />;
  if (!group) return (
    <div className="text-center text-gray-500 py-20">Garage not found.</div>
  );

  const outstanding = Number(group.outstanding || 0);

  return (
    <div>
      <PageHeader
        title={group.garage_name}
        subtitle={[group.garage_phone, group.garage_location].filter(Boolean).join(' · ')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => navigate(-1)}>
              <ChevronLeft size={15} /> Back
            </Button>
            <Button variant="secondary" onClick={() => downloadGarageInvoice(group)}>
              <FileText size={15} /> Group Invoice
            </Button>
            {outstanding > 0 && (
              <Button onClick={() => setPayModal(true)}>
                <CreditCard size={15} /> Pay Group
              </Button>
            )}
          </div>
        }
      />

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <SummaryChip label="Total Job Cards" value={group.job_card_count} color="violet" />
        <SummaryChip label="Total Amount" value={fmt(group.total_amount)} color="sky" />
        <SummaryChip label="Paid" value={fmt(group.paid_amount)} color="emerald" />
        <SummaryChip
          label="Outstanding"
          value={fmt(group.outstanding)}
          color={outstanding > 0 ? 'red' : 'emerald'}
        />
      </div>

      {/* Pending section */}
      {pending.length > 0 && (
        <section className="mb-8">
          <SectionHeading
            icon={<Clock size={16} className="text-yellow-400" />}
            label="Pending Payment"
            count={pending.length}
            accent="yellow"
          />
          <div className="space-y-3">
            {pending.map(jc => (
              <JobCardRow key={jc.id} jc={jc} navigate={navigate} />
            ))}
          </div>
        </section>
      )}

      {/* Paid section */}
      {paid.length > 0 && (
        <section>
          <SectionHeading
            icon={<CheckCircle2 size={16} className="text-emerald-400" />}
            label="Paid"
            count={paid.length}
            accent="emerald"
          />
          <div className="space-y-3">
            {paid.map(jc => (
              <JobCardRow key={jc.id} jc={jc} navigate={navigate} />
            ))}
          </div>
        </section>
      )}

      {payModal && (
        <GaragePaymentModal
          group={group}
          onClose={() => setPayModal(false)}
          onPaid={() => { setPayModal(false); load(); }}
        />
      )}
    </div>
  );
}

/* --- Summary chip --- */
function SummaryChip({ label, value, color }) {
  const colors = {
    violet: 'border-violet-700/40 bg-violet-950/30 text-violet-300',
    sky: 'border-sky-700/40 bg-sky-950/30 text-sky-300',
    emerald: 'border-emerald-700/40 bg-emerald-950/30 text-emerald-300',
    red: 'border-red-700/40 bg-red-950/30 text-red-300',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] || colors.sky}`}>
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

/* --- Section heading --- */
function SectionHeading({ icon, label, count, accent }) {
  const accents = {
    yellow: 'border-yellow-800/40 bg-yellow-950/20',
    emerald: 'border-emerald-800/40 bg-emerald-950/20',
  };
  return (
    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border mb-3 ${accents[accent] || accents.yellow}`}>
      {icon}
      <span className="font-semibold text-gray-200 text-sm">{label}</span>
      <span className="ml-1 text-xs text-gray-500 font-normal">{count} job card{count !== 1 ? 's' : ''}</span>
    </div>
  );
}

/* --- Individual job card row --- */
function JobCardRow({ jc, navigate }) {
  const payStatus = PAY_STATUS[jc.payment_status] || PAY_STATUS.unpaid;
  const outstanding = Number(jc.outstanding || 0);
  const services = jc.job_card_services || [];
  const payments = jc.payments || [];

  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden hover:border-accent/30 transition-colors">
      {/* Card header */}
      <div
        className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-4 cursor-pointer hover:bg-bg-hover/40 transition-colors"
        onClick={() => navigate(`/jobcards/${jc.id}`)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-violet-300">{jc.job_card_number}</span>
            <span className="font-semibold text-sky-300">{jc.vehicle_number}</span>
            {(jc.vehicle_company || jc.vehicle_model) && (
              <span className="text-xs text-gray-500">
                {[jc.vehicle_company, jc.vehicle_model, jc.vehicle_colour].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
            <span>{jc.job_card_date}</span>
            {jc.employee_name && (
              <span className="flex items-center gap-1">
                <User size={10} /> {jc.employee_name}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap sm:shrink-0 sm:justify-end">
          <div className="text-right">
            <div className="font-bold text-gray-100">{fmt(jc.total_amount)}</div>
            {outstanding > 0 && (
              <div className="text-xs text-red-400 mt-0.5">{fmt(outstanding)} due</div>
            )}
          </div>
          <Badge variant={jc.job_card_status === 'COMPLETED' ? 'green' : 'yellow'}>
            {jc.job_card_status === 'COMPLETED' ? 'Completed' : 'In Progress'}
          </Badge>
          <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border ${payStatus.cls}`}>
            {payStatus.label}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={e => { e.stopPropagation(); downloadJobCardInvoice(jc); }}
            title="Download invoice"
          >
            <FileText size={13} />
          </Button>
        </div>
      </div>

      {/* Services list */}
      {services.length > 0 && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Wrench size={11} className="text-gray-500" />
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Services</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {services.map((s, i) => (
              <div key={i} className="flex items-center justify-between bg-bg-hover/50 rounded-lg px-3 py-1.5">
                <div>
                  <span className="text-sm text-gray-200">{s.service_name}</span>
                  <span className={`ml-2 text-[10px] font-medium ${s.service_status === 'completed' ? 'text-emerald-400' : 'text-yellow-500'
                    }`}>
                    {s.service_status === 'completed' ? '✓' : '⏳'}
                  </span>
                </div>
                <span className="text-sm font-semibold text-violet-300">{fmt(s.price_at_time)}</span>
              </div>
            ))}
          </div>

          {payments.length > 0 && (
            <div className="mt-3 border-t border-border/50 pt-3">
              <div className="flex items-center gap-1.5 mb-2">
                <IndianRupee size={11} className="text-gray-500" />
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Payments Recorded</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {payments.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 bg-emerald-950/30 border border-emerald-800/30 rounded-lg px-3 py-1.5 text-xs">
                    <span className="text-emerald-300 font-semibold">{fmt(p.amount)}</span>
                    <span className="text-gray-500">{p.payment_date}</span>
                    <span className="text-gray-600 capitalize">{p.payment_method}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* --- Group Payment Modal --- */
function GaragePaymentModal({ group, onClose, onPaid }) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const outstanding = Number(group.outstanding || 0);

  const outstandingCards = useMemo(() =>
    (group.job_cards || [])
      .filter(jc => Number(jc.outstanding || 0) > 0)
      .sort((a, b) => new Date(a.job_card_date) - new Date(b.job_card_date) || a.id - b.id),
    [group]
  );

  const distribution = useMemo(() => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return [];
    let remaining = amt;
    return outstandingCards.reduce((acc, jc) => {
      if (remaining <= 0) return acc;
      const due = Number(jc.outstanding || 0);
      const apply = Math.min(remaining, due);
      remaining -= apply;
      return [...acc, { ...jc, apply }];
    }, []);
  }, [amount, outstandingCards]);

  const handleSubmit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0 || amt > outstanding) { toast.error('Enter a valid amount'); return; }
    setSubmitting(true);
    try {
      await createGaragePayment({
        garage_id: group.garage_id,
        amount: amt,
        payment_method: method,
        payment_date: payDate,
        notes,
      });
      toast.success('Payment recorded');
      onPaid();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-gray-100">Group Payment</h2>
              <p className="text-sm text-sky-400 mt-0.5">{group.garage_name}</p>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-2xl font-bold leading-none">&times;</button>
          </div>

          <div className="bg-bg-hover rounded-xl p-3 mb-4 flex items-center justify-between">
            <span className="text-sm text-gray-400">Total Outstanding</span>
            <span className="text-xl font-bold text-red-400">{fmt(outstanding)}</span>
          </div>

          {outstandingCards.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Outstanding Job Cards</div>
              <div className="space-y-1.5">
                {outstandingCards.map(jc => (
                  <div key={jc.id} className="flex items-center justify-between text-sm bg-bg-hover/50 rounded-lg px-3 py-2">
                    <div>
                      <span className="text-violet-300 font-medium">{jc.job_card_number}</span>
                      <span className="text-gray-500 ml-2">{jc.vehicle_number}</span>
                    </div>
                    <span className="text-red-400 font-semibold">{fmt(jc.outstanding)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3 mb-4">
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">
                Payment Amount ({INR})
              </label>
              <div className="flex gap-2">
                <input
                  type="number" min="0" step="0.01"
                  value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 bg-bg-hover border border-border rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <Button variant="secondary" size="sm" onClick={() => setAmount(String(outstanding))}>
                  Full
                </Button>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Payment Method</label>
              <Select value={method} onChange={e => setMethod(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="netbanking">Net Banking</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </Select>
            </div>
            {method === 'upi' && <UpiQr amount={amount} />}
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Date</label>
              <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Notes</label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
            </div>
          </div>

          {distribution.length > 0 && (
            <div className="mb-4 bg-emerald-950/30 border border-emerald-800/30 rounded-xl p-3">
              <div className="text-xs text-emerald-500 uppercase tracking-wide mb-2">Distribution Preview (oldest first)</div>
              <div className="space-y-1">
                {distribution.map(d => (
                  <div key={d.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="text-violet-300">{d.job_card_number}</span>
                      <span className="text-gray-500 ml-2">{d.vehicle_number}</span>
                    </div>
                    <span className="text-emerald-400 font-semibold">+{fmt(d.apply)}</span>
                  </div>
                ))}
              </div>
              {Number(amount) > outstanding && (
                <div className="mt-2 text-xs text-yellow-400">
                  Amount exceeds outstanding by {fmt(Number(amount) - outstanding)}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={submitting || !amount || Number(amount) <= 0}
            >
              {submitting ? 'Processing...' : 'Record Payment'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
