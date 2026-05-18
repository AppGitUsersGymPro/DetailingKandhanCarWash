import { useEffect, useRef, useState } from 'react';
import { CheckCircle, XCircle, LogIn, LogOut, RefreshCw, Clock } from 'lucide-react';
import Button from '../../components/Button';
import { kioskLookup, kioskCheckIn } from '../../api/employees';
import { extractError } from '../../api/axios';

const TYPE_LABEL = {
  full_time:  'Full-time',
  part_time:  'Part-time',
  contractor: 'Contractor',
};

const EMP_STATUS_STYLE = {
  active:   'bg-emerald-900/30 text-emerald-400 border-emerald-700/40',
  inactive: 'bg-red-900/30 text-red-400 border-red-700/40',
  on_leave: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/40',
};

const ACTION_LABEL = {
  check_in:        { verb: 'Check In',          icon: LogIn,  color: 'text-emerald-400' },
  check_out:       { verb: 'Check Out',          icon: LogOut, color: 'text-blue-400'    },
  update_checkout: { verb: 'Update Check-Out',   icon: LogOut, color: 'text-yellow-400'  },
};

const RESULT_STYLE = {
  checked_in:       { title: 'Checked In!',          color: 'text-emerald-400', ring: 'ring-emerald-500/40' },
  checked_out:      { title: 'Checked Out!',          color: 'text-blue-400',    ring: 'ring-blue-500/40'    },
  checkout_updated: { title: 'Check-Out Updated!',    color: 'text-yellow-400',  ring: 'ring-yellow-500/40'  },
};

const AVATAR_COLORS = [
  'bg-accent/20 text-accent',
  'bg-emerald-900/50 text-emerald-300',
  'bg-blue-900/50 text-blue-300',
  'bg-purple-900/50 text-purple-300',
  'bg-yellow-900/50 text-yellow-300',
];

function getInitials(name) {
  return (name || '?').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

function fmt12(timeStr) {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr || '00';
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${suffix}`;
}

function todayDateStr() {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function avatarColor(name) {
  const i = (name || '').charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[i];
}

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="text-center mb-8">
      <div className="text-5xl font-mono font-bold text-gray-100 tracking-wider">{timeStr}</div>
      <div className="text-sm text-gray-500 mt-1">{dateStr}</div>
    </div>
  );
}

export default function KioskTab() {
  const [step, setStep]       = useState('input');   // input | confirm | result | error
  const [code, setCode]       = useState('');
  const [loading, setLoading] = useState(false);
  const [person, setPerson]   = useState(null);      // lookup result
  const [result, setResult]   = useState(null);      // checkin result
  const [errorMsg, setErrorMsg] = useState('');
  const [countdown, setCountdown] = useState(5);
  const inputRef = useRef(null);
  const countdownRef = useRef(null);

  // Auto-focus input when on the input step
  useEffect(() => {
    if (step === 'input') {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [step]);

  // Countdown and auto-reset after result/error
  useEffect(() => {
    if (step !== 'result' && step !== 'error') return;
    setCountdown(5);
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(countdownRef.current);
          reset();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(countdownRef.current);
  }, [step]); // eslint-disable-line

  const reset = () => {
    setStep('input');
    setCode('');
    setPerson(null);
    setResult(null);
    setErrorMsg('');
  };

  const handleLookup = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    try {
      const data = await kioskLookup({ employee_code: code.trim() });
      setPerson(data);
      setStep('confirm');
    } catch (err) {
      setErrorMsg(extractError(err));
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const data = await kioskCheckIn({ employee_code: person.employee_code });
      setResult(data);
      setStep('result');
    } catch (err) {
      setErrorMsg(extractError(err));
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center py-8">

      {/* ── STEP 1: Input ─────────────────────────────────────────────── */}
      {step === 'input' && (
        <div className="w-full max-w-md">
          <LiveClock />
          <div className="bg-bg-card border border-border rounded-2xl p-8 shadow-xl">
            <div className="flex items-center justify-center gap-2.5 mb-6">
              <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                <LogIn size={18} className="text-accent" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-100">Employee Kiosk</h2>
                <p className="text-xs text-gray-500">Enter your employee code to mark attendance</p>
              </div>
            </div>

            <form onSubmit={handleLookup} className="space-y-4">
              <input
                ref={inputRef}
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. EMP001"
                className="w-full bg-bg-elev border border-border rounded-xl px-5 py-4 text-2xl font-mono text-center text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-accent transition-colors tracking-widest"
                autoComplete="off"
                disabled={loading}
              />
              <Button
                type="submit"
                loading={loading}
                disabled={!code.trim() || loading}
                className="w-full py-3 text-base"
              >
                Look Up
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* ── STEP 2: Confirm ───────────────────────────────────────────── */}
      {step === 'confirm' && person && (() => {
        const action = ACTION_LABEL[person.next_action] || ACTION_LABEL.check_in;
        const ActionIcon = action.icon;
        return (
          <div className="w-full max-w-sm">
            <div className="bg-bg-card border border-border rounded-2xl p-8 shadow-xl text-center">

              {/* Avatar */}
              <div className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4 ${avatarColor(person.employee_name)}`}>
                {getInitials(person.employee_name)}
              </div>

              {/* Name */}
              <h2 className="text-2xl font-bold text-gray-100 mb-1">{person.employee_name}</h2>
              <div className="flex items-center justify-center gap-2 mb-4 flex-wrap">
                <span className="text-sm text-gray-400">{TYPE_LABEL[person.employee_type] || person.employee_type}</span>
                <span className="text-gray-600">·</span>
                <span className="font-mono text-xs text-gray-500">{person.employee_code}</span>
              </div>

              {/* Status + shift */}
              <div className="flex items-center justify-center gap-2 mb-6 flex-wrap">
                {person.emp_status && (
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${EMP_STATUS_STYLE[person.emp_status] || 'bg-bg-elev text-gray-400 border-border'}`}>
                    {person.emp_status === 'on_leave' ? 'On Leave' : person.emp_status === 'inactive' ? 'Inactive' : 'Active'}
                  </span>
                )}
                {person.shift_name && (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-bg-elev text-gray-400 border border-border">
                    <Clock size={10} /> {person.shift_name}
                  </span>
                )}
              </div>

              {/* Today's time info */}
              {(person.check_in_time || person.check_out_time) && (
                <div className="bg-bg-elev border border-border rounded-xl px-4 py-3 mb-5 flex items-center justify-around text-xs">
                  {person.check_in_time && (
                    <div className="text-center">
                      <div className="text-gray-500 mb-0.5">Checked in</div>
                      <div className="font-mono font-semibold text-emerald-400 text-base">{fmt12(person.check_in_time)}</div>
                      <div className="text-gray-600 text-[10px] mt-0.5">{todayDateStr()}</div>
                    </div>
                  )}
                  {person.check_out_time && (
                    <div className="text-center">
                      <div className="text-gray-500 mb-0.5">Checked out</div>
                      <div className="font-mono font-semibold text-blue-400 text-base">{fmt12(person.check_out_time)}</div>
                      <div className="text-gray-600 text-[10px] mt-0.5">{todayDateStr()}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Is this you? */}
              <p className="text-sm text-gray-400 mb-5 font-medium">Is this you?</p>

              {/* Action label */}
              <div className={`flex items-center justify-center gap-1.5 mb-5 text-sm font-semibold ${action.color}`}>
                <ActionIcon size={15} /> {action.verb}
              </div>

              <div className="flex gap-3">
                <Button variant="secondary" onClick={reset} className="flex-1" disabled={loading}>
                  Not Me
                </Button>
                <Button onClick={handleConfirm} loading={loading} className="flex-1">
                  Confirm {action.verb}
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── STEP 3: Result ────────────────────────────────────────────── */}
      {step === 'result' && result && (() => {
        const style = RESULT_STYLE[result.action] || RESULT_STYLE.checked_in;
        return (
          <div className="w-full max-w-sm text-center">
            <div className="bg-bg-card border border-border rounded-2xl p-10 shadow-xl">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ring-4 ${style.ring} bg-bg-elev`}>
                <CheckCircle size={40} className={style.color} />
              </div>
              <h2 className={`text-3xl font-bold mb-2 ${style.color}`}>{style.title}</h2>
              <p className="text-xl text-gray-100 font-semibold mb-1">{result.employee_name}</p>
              <div className="my-4">
                <p className="font-mono text-3xl text-gray-200 font-bold">{fmt12(result.time)}</p>
                <p className="text-sm text-gray-500 mt-1">{todayDateStr()}</p>
              </div>
              <p className="text-sm text-gray-400 mb-6">{result.message}</p>

              <div className="flex items-center justify-center gap-2 text-xs text-gray-600">
                <RefreshCw size={11} className="animate-spin" />
                Resetting in {countdown}s…
              </div>
              <button
                onClick={reset}
                className="mt-4 text-xs text-accent hover:underline"
              >
                Reset now
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Error ─────────────────────────────────────────────────────── */}
      {step === 'error' && (
        <div className="w-full max-w-sm text-center">
          <div className="bg-bg-card border border-red-800/40 rounded-2xl p-10 shadow-xl">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ring-4 ring-red-500/30 bg-bg-elev">
              <XCircle size={40} className="text-red-400" />
            </div>
            <h2 className="text-2xl font-bold text-red-400 mb-3">Not Found</h2>
            <p className="text-sm text-gray-400 mb-6">{errorMsg}</p>

            <div className="flex items-center justify-center gap-2 text-xs text-gray-600 mb-4">
              <RefreshCw size={11} className="animate-spin" />
              Resetting in {countdown}s…
            </div>
            <Button onClick={reset}>Try Again</Button>
          </div>
        </div>
      )}
    </div>
  );
}
