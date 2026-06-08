import { useEffect, useState } from 'react';
import {
  Settings2, Building2, TrendingUp, Cog, ShieldCheck,
  Save, Eye, EyeOff, ChevronDown, UserPlus, Trash2, KeyRound, Users,
} from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Loading from '../../components/Loading';
import Button from '../../components/Button';
import { Field, Input, Select, Textarea } from '../../components/Field';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import {
  getSettings, updateSettings, changePassword,
  listStaffUsers, createStaffUser, deleteStaffUser, resetStaffPassword,
  listAvailableEmployees,
} from '../../api/settings';
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

// ── Staff Accounts Card ───────────────────────────────────────────────────────

const RESERVED_USERNAMES = ['admin'];

function StaffAccountsCard() {
  const toast = useToast();
  const [staff,        setStaff]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [modal,        setModal]        = useState(false);
  const [availEmps,    setAvailEmps]    = useState([]);
  const [empsLoading,  setEmpsLoading]  = useState(false);
  const [confirmDel,   setConfirmDel]   = useState(null);
  const [resetModal,   setResetModal]   = useState(null);
  const [delLoading,   setDelLoading]   = useState(false);
  const [createdCred,  setCreatedCred]  = useState(null); // shown after successful create
  const [form,         setForm]         = useState({ username: '', password: '', confirm: '', employee_id: '' });
  const [formErrors,   setFormErrors]   = useState({});
  const [submitting,   setSubmitting]   = useState(false);
  const [showPwd,      setShowPwd]      = useState(false);
  const [resetPwd,     setResetPwd]     = useState('');
  const [resetConf,    setResetConf]    = useState('');
  const [resetErr,     setResetErr]     = useState('');
  const [resetSaving,  setResetSaving]  = useState(false);

  const load = async () => {
    setLoading(true);
    try { setStaff(await listStaffUsers()); }
    catch (err) { toast.error(extractError(err)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const openCreate = async () => {
    setForm({ username: '', password: '', confirm: '', employee_id: '' });
    setFormErrors({});
    setShowPwd(false);
    setModal(true);
    setEmpsLoading(true);
    try { setAvailEmps(await listAvailableEmployees()); }
    catch { setAvailEmps([]); }
    finally { setEmpsLoading(false); }
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    const errs = {};
    const uname = form.username.trim();
    if (!uname) {
      errs.username = 'Required';
    } else if (RESERVED_USERNAMES.includes(uname.toLowerCase())) {
      errs.username = '"admin" is reserved and cannot be used for staff accounts';
    }
    if (!form.password)                errs.password = 'Required';
    else if (form.password.length < 6) errs.password = 'Min 6 characters';
    if (form.password !== form.confirm) errs.confirm = 'Passwords do not match';
    setFormErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      const payload = {
        username:    uname,
        password:    form.password,
        employee_id: form.employee_id ? Number(form.employee_id) : null,
      };
      const created = await createStaffUser(payload);
      setModal(false);
      load();
      // Show credential summary (password shown once)
      setCreatedCred({
        employee_name: created.employee_name,
        username:      created.username,
        password:      form.password,
      });
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!confirmDel) return;
    setDelLoading(true);
    try {
      await deleteStaffUser(confirmDel.id);
      toast.success('Staff account deleted');
      setConfirmDel(null);
      load();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setDelLoading(false);
    }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    setResetErr('');
    if (!resetPwd)              { setResetErr('Required'); return; }
    if (resetPwd.length < 6)   { setResetErr('Min 6 characters'); return; }
    if (resetPwd !== resetConf) { setResetErr('Passwords do not match'); return; }
    setResetSaving(true);
    try {
      await resetStaffPassword(resetModal.id, { password: resetPwd });
      toast.success(`Password reset for ${resetModal.employee_name || resetModal.username}`);
      setResetModal(null);
      setResetPwd(''); setResetConf('');
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setResetSaving(false);
    }
  };

  return (
    <>
      <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <Users size={15} className="text-violet-400" />
            <h2 className="text-sm font-semibold text-violet-400">Staff Accounts</h2>
          </div>
          <Button size="sm" onClick={openCreate}>
            <UserPlus size={13} /> Add Staff
          </Button>
        </div>

        {/* Post-create credential banner */}
        {createdCred && (
          <div className="mx-5 mt-4 mb-1 rounded-lg border border-emerald-600/40 bg-emerald-900/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wide">
                  Account created — share these credentials once
                </p>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Employee</div>
                    <div className="font-medium text-gray-100">{createdCred.employee_name || 'Common (all staff)'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Username</div>
                    <code className="font-mono font-medium text-amber-300">{createdCred.username}</code>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Password</div>
                    <code className="font-mono font-medium text-amber-300">{createdCred.password}</code>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setCreatedCred(null)}
                className="text-gray-500 hover:text-gray-300 text-lg leading-none mt-0.5"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="px-5 py-6 text-sm text-gray-500">Loading…</div>
        ) : staff.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-500">
            No staff accounts yet. Add one to give limited-access logins.
          </div>
        ) : (
          <table className="w-full text-sm mt-2">
            <thead className="border-b border-white/5">
              <tr>
                <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-500">Employee</th>
                <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-500">Username</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {staff.map(u => (
                <tr key={u.id} className="group">
                  <td className="px-5 py-3">
                    {u.employee_name ? (
                      <div>
                        <div className="font-medium text-gray-100">{u.employee_name}</div>
                        <div className="text-[11px] text-gray-500">{u.employee_code}</div>
                      </div>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full border bg-sky-900/30 text-sky-300 border-sky-700/40 font-medium">
                        Common
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <code className="text-xs font-mono text-amber-300 bg-amber-900/20 px-1.5 py-0.5 rounded">
                      {u.username}
                    </code>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        title="Reset password"
                        onClick={() => { setResetModal(u); setResetPwd(''); setResetConf(''); setResetErr(''); }}
                        className="p-1.5 text-gray-400 hover:text-amber-400 transition-colors"
                      >
                        <KeyRound size={14} />
                      </button>
                      <button
                        title="Delete"
                        onClick={() => setConfirmDel(u)}
                        className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="px-5 py-2.5 border-t border-white/5 text-[11px] text-gray-600 mt-1">
          Staff can access: Dashboard · Job Cards · Customers / Vehicles · Sales · Kiosk
        </div>
      </div>

      {/* Create modal */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Add Staff Account"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={submitCreate} loading={submitting}>Create Account</Button>
          </>
        }
      >
        <form onSubmit={submitCreate} className="space-y-4">
          {/* Employee mapping */}
          <Field label="Map to Employee" error={formErrors.employee_id}>
            <div className="relative">
              <select
                value={form.employee_id}
                onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}
                disabled={empsLoading}
                className="w-full appearance-none bg-bg-elev border border-border rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-accent pr-8 disabled:opacity-50"
              >
                <option value="">Common (shared login for all staff)</option>
                {availEmps.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.employee_name} ({emp.employee_code})
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              {form.employee_id
                ? 'This login belongs exclusively to the selected employee.'
                : 'Common logins are not tied to any specific employee.'}
            </p>
          </Field>

          <Field label="Username" required error={formErrors.username}>
            <Input
              autoFocus
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              placeholder='e.g. rajan01  (cannot be "admin")'
            />
          </Field>
          <Field label="Password" required error={formErrors.password}>
            <div className="relative">
              <Input
                type={showPwd ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Min 6 characters"
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                tabIndex={-1}
              >
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>
          <Field label="Confirm Password" required error={formErrors.confirm}>
            <Input
              type={showPwd ? 'text' : 'password'}
              value={form.confirm}
              onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
              placeholder="Re-enter password"
            />
          </Field>
        </form>
      </Modal>

      {/* Reset password modal */}
      <Modal
        open={!!resetModal}
        onClose={() => setResetModal(null)}
        title={`Reset Password — ${resetModal?.employee_name || resetModal?.username}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetModal(null)}>Cancel</Button>
            <Button onClick={submitReset} loading={resetSaving}>Save Password</Button>
          </>
        }
      >
        <form onSubmit={submitReset} className="space-y-4">
          <p className="text-xs text-gray-500">
            Username: <code className="text-amber-300 font-mono">{resetModal?.username}</code>
          </p>
          <Field label="New Password" required error={resetErr}>
            <Input
              type="password"
              autoFocus
              value={resetPwd}
              onChange={e => setResetPwd(e.target.value)}
              placeholder="Min 6 characters"
            />
          </Field>
          <Field label="Confirm Password">
            <Input
              type="password"
              value={resetConf}
              onChange={e => setResetConf(e.target.value)}
              placeholder="Re-enter password"
            />
          </Field>
        </form>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={confirmDelete}
        loading={delLoading}
        title={`Delete ${confirmDel?.employee_name || confirmDel?.username}?`}
        message="This staff account will be permanently removed. They will no longer be able to log in."
      />
    </>
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

  // Group settings by category
  const grouped = {};
  for (const s of settings) {
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

          {/* Change Password */}
          <ChangePasswordCard />

          {/* Staff Accounts */}
          <StaffAccountsCard />
        </div>
      )}
    </div>
  );
}
