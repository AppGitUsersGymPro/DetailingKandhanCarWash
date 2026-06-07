import { useEffect, useState } from 'react';
import {
  Settings2, Building2, TrendingUp, Cog, ShieldCheck,
  Save, Eye, EyeOff, ChevronDown, Bell,
} from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Loading from '../../components/Loading';
import Button from '../../components/Button';
import { Field, Input, Select, Textarea } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { getSettings, updateSettings, changePassword } from '../../api/settings';
import { extractError } from '../../api/axios';

// ── Section meta ────────────────────────────────────────────────────────────

const SECTIONS = [
  { key: 'financial',  label: 'Financial',        icon: TrendingUp,  accent: 'indigo' },
  { key: 'business',   label: 'Business Info',     icon: Building2,   accent: 'teal'   },
  { key: 'incentive',  label: 'Staff & Incentive', icon: Settings2,   accent: 'violet' },
  { key: 'operations', label: 'Operations',        icon: Cog,         accent: 'amber'  },
];

const ACCENT = {
  indigo: { header: 'text-indigo-400',  border: 'border-indigo-500/20', bg: 'bg-indigo-500/5'  },
  teal:   { header: 'text-teal-400',    border: 'border-teal-500/20',   bg: 'bg-teal-500/5'    },
  violet: { header: 'text-violet-400',  border: 'border-violet-500/20', bg: 'bg-violet-500/5'  },
  amber:  { header: 'text-amber-400',   border: 'border-amber-500/20',  bg: 'bg-amber-500/5'   },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function SettingInput({ setting, value, onChange }) {
  const { field_type, options } = setting;

  if (field_type === 'select') {
    const opts = options ? options.split(',').map(o => o.trim()) : [];
    return (
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full appearance-none bg-bg-elev border border-border rounded-lg px-3 py-2 text-sm text-gray-100
                     focus:outline-none focus:border-accent pr-8"
        >
          {opts.map(o => (
            <option key={o} value={o}>
              {o.charAt(0).toUpperCase() + o.slice(1).replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
      </div>
    );
  }

  if (field_type === 'textarea') {
    return (
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
        className="w-full bg-bg-elev border border-border rounded-lg px-3 py-2 text-sm text-gray-100
                   focus:outline-none focus:border-accent resize-none"
      />
    );
  }

  const inputType = { email: 'email', tel: 'tel', number: 'number', percent: 'number' }[field_type] || 'text';
  const suffix    = field_type === 'percent' ? '%' : field_type === 'number' && setting.label.includes('₹') ? '₹' : null;

  return (
    <div className="relative">
      <input
        type={inputType}
        step={field_type === 'percent' || field_type === 'number' ? '0.01' : undefined}
        min={field_type === 'percent' || field_type === 'number' ? '0' : undefined}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full bg-bg-elev border border-border rounded-lg px-3 py-2 text-sm text-gray-100
                    focus:outline-none focus:border-accent ${suffix ? 'pr-7' : ''}`}
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );
}

// ── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ section, settings, values, onChange, onSave, saving }) {
  const a   = ACCENT[section.accent] || ACCENT.indigo;
  const Icon = section.icon;

  const hasChanges = settings.some(s => values[s.field_name] !== s.value);

  return (
    <div className={`rounded-xl border ${a.border} ${a.bg} overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <Icon size={15} className={a.header} />
          <h2 className={`text-sm font-semibold ${a.header}`}>{section.label}</h2>
        </div>
        <Button
          size="sm"
          onClick={() => onSave(section.key)}
          loading={saving === section.key}
          disabled={!hasChanges}
        >
          <Save size={13} /> Save
        </Button>
      </div>

      {/* Table */}
      <table className="w-full">
        <tbody className="divide-y divide-white/5">
          {settings.map(s => (
            <tr key={s.field_name} className="group">
              <td className="px-5 py-3 w-[42%] align-top">
                <div className="text-sm text-gray-200 font-medium leading-tight">{s.label}</div>
                {s.description && (
                  <div className="text-xs text-gray-500 mt-0.5 leading-snug">{s.description}</div>
                )}
              </td>
              <td className="px-5 py-3 align-middle">
                <SettingInput
                  setting={s}
                  value={values[s.field_name] ?? s.value}
                  onChange={v => onChange(s.field_name, v)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Change Password Card ──────────────────────────────────────────────────────

function ChangePasswordCard() {
  const toast = useToast();
  const [oldPwd,  setOldPwd]  = useState('');
  const [newPwd,  setNewPwd]  = useState('');
  const [confPwd, setConfPwd] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [errors,  setErrors]  = useState({});

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!oldPwd)            errs.old = 'Required';
    if (!newPwd)            errs.new = 'Required';
    else if (newPwd.length < 8) errs.new = 'At least 8 characters';
    if (newPwd !== confPwd) errs.conf = 'Passwords do not match';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      await changePassword({ old_password: oldPwd, new_password: newPwd });
      toast.success('Password updated successfully');
      setOldPwd(''); setNewPwd(''); setConfPwd(''); setErrors({});
    } catch (err) {
      const msg = extractError(err);
      if (msg.toLowerCase().includes('current') || msg.toLowerCase().includes('incorrect')) {
        setErrors({ old: msg });
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const PwdInput = ({ label, value, onChange, show, onToggle, error }) => (
    <Field label={label} error={error}>
      <div className="relative">
        <Input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="pr-9"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
          tabIndex={-1}
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </Field>
  );

  return (
    <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-white/5">
        <ShieldCheck size={15} className="text-rose-400" />
        <h2 className="text-sm font-semibold text-rose-400">Security — Change Password</h2>
      </div>
      <form onSubmit={submit} className="px-5 py-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PwdInput
            label="Current Password"
            value={oldPwd} onChange={setOldPwd}
            show={showOld} onToggle={() => setShowOld(v => !v)}
            error={errors.old}
          />
          <PwdInput
            label="New Password"
            value={newPwd} onChange={setNewPwd}
            show={showNew} onToggle={() => setShowNew(v => !v)}
            error={errors.new}
          />
          <PwdInput
            label="Confirm New Password"
            value={confPwd} onChange={setConfPwd}
            show={showNew} onToggle={() => setShowNew(v => !v)}
            error={errors.conf}
          />
        </div>
        <div className="flex justify-end mt-4">
          <Button type="submit" loading={saving}>
            <ShieldCheck size={14} /> Change Password
          </Button>
        </div>
      </form>
    </div>
  );
}

// ── Notification Toggle Card ──────────────────────────────────────────────────

const NOTIFY_TOGGLES = [
  { key: 'NOTIFY_CHECKIN',          label: 'Vehicle Check-in',      desc: 'Sent to customer when their vehicle is checked in' },
  { key: 'NOTIFY_COMPLETED',        label: 'Job Completed',          desc: 'Sent when job card is marked complete and vehicle is ready' },
  { key: 'NOTIFY_PAYMENT',          label: 'Payment Received',       desc: 'Sent to customer after each payment is recorded' },
  { key: 'NOTIFY_CUSTOMER_WELCOME', label: 'New Customer Welcome',   desc: 'Sent when a new customer is registered' },
  { key: 'NOTIFY_GARAGE_PAYMENT',   label: 'Garage Payment Applied', desc: 'Sent to the garage owner when a bulk payment is applied' },
  { key: 'NOTIFY_SERVICE_REMINDER', label: 'Service Due Reminder',   desc: 'Sent when a vehicle is due for its next service' },
];

function NotificationTogglesCard({ values, onChange }) {
  const toast = useToast();

  const toggle = async (key, currentVal) => {
    const isOn  = currentVal !== 'false';
    const newVal = isOn ? 'false' : 'true';
    onChange(key, newVal);
    try {
      await updateSettings({ [key]: newVal });
    } catch (err) {
      onChange(key, currentVal);
      toast.error(extractError(err));
    }
  };

  return (
    <div className="rounded-xl border border-green-500/20 bg-green-500/5 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <Bell size={15} className="text-green-400" />
          <h2 className="text-sm font-semibold text-green-400">WhatsApp Notifications</h2>
        </div>
        <span className="text-xs text-gray-500">Saves instantly on toggle</span>
      </div>
      <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {NOTIFY_TOGGLES.map(({ key, label, desc }) => {
          const isOn = (values[key] ?? 'true') !== 'false';
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key, values[key] ?? 'true')}
              className={`flex items-center justify-between gap-3 rounded-lg px-4 py-3 border text-left transition-colors w-full
                ${isOn
                  ? 'border-green-500/30 bg-green-500/10 hover:bg-green-500/15'
                  : 'border-border bg-bg-elev hover:bg-white/5'
                }`}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-200 truncate">{label}</div>
                <div className="text-xs text-gray-500 mt-0.5 leading-snug">{desc}</div>
              </div>
              <div className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${isOn ? 'bg-green-500' : 'bg-gray-600'}`}>
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${isOn ? 'left-6' : 'left-1'}`} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const toast = useToast();

  const [loading,  setLoading]  = useState(true);
  const [settings, setSettings] = useState([]);   // canonical values from API
  const [values,   setValues]   = useState({});   // live edited values
  const [saving,   setSaving]   = useState(null); // section key being saved

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSettings()
      .then(data => {
        if (cancelled) return;
        setSettings(data);
        const v = {};
        data.forEach(s => { v[s.field_name] = s.value; });
        setValues(v);
      })
      .catch(err => { if (!cancelled) toast.error(extractError(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (field_name, val) => {
    setValues(prev => ({ ...prev, [field_name]: val }));
  };

  const saveSection = async (categoryKey) => {
    const sectionSettings = settings.filter(s => s.category === categoryKey);
    const payload = {};
    sectionSettings.forEach(s => {
      if (values[s.field_name] !== s.value) {
        payload[s.field_name] = values[s.field_name];
      }
    });

    if (!Object.keys(payload).length) {
      toast.error('No changes to save');
      return;
    }

    setSaving(categoryKey);
    try {
      await updateSettings(payload);
      // Sync canonical values so "hasChanges" resets
      setSettings(prev =>
        prev.map(s =>
          payload[s.field_name] !== undefined ? { ...s, value: payload[s.field_name] } : s
        )
      );
      toast.success('Settings saved');
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSaving(null);
    }
  };

  // Group settings by category — exclude NOTIFY_* keys from section cards
  // (they are shown in the dedicated NotificationTogglesCard instead)
  const NOTIFY_KEYS = new Set(NOTIFY_TOGGLES.map(t => t.key));
  const grouped = {};
  for (const s of settings) {
    if (NOTIFY_KEYS.has(s.field_name)) continue;
    if (!grouped[s.category]) grouped[s.category] = [];
    grouped[s.category].push(s);
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Configure business settings, defaults, and preferences"
      />

      {loading ? (
        <Loading />
      ) : (
        <div className="space-y-5">
          {/* Two-column layout for first two sections */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {SECTIONS.filter(s => grouped[s.key]?.length).slice(0, 2).map(section => (
              <SectionCard
                key={section.key}
                section={section}
                settings={grouped[section.key] || []}
                values={values}
                onChange={handleChange}
                onSave={saveSection}
                saving={saving}
              />
            ))}
          </div>

          {/* Full-width for remaining sections */}
          {SECTIONS.filter(s => grouped[s.key]?.length).slice(2).map(section => (
            <SectionCard
              key={section.key}
              section={section}
              settings={grouped[section.key] || []}
              values={values}
              onChange={handleChange}
              onSave={saveSection}
              saving={saving}
            />
          ))}

          {/* WhatsApp Notification Toggles */}
          <NotificationTogglesCard values={values} onChange={handleChange} />

          {/* Change Password */}
          <ChangePasswordCard />
        </div>
      )}
    </div>
  );
}
