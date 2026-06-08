import { useState } from 'react';
import {
  BookOpen, Search,
  LayoutDashboard, ClipboardList, Users, Wrench,
  ShoppingCart, UserCog, Truck, TrendingUp, ScanLine,
  Bell, Settings2, ArrowRight, Lightbulb, Zap,
} from 'lucide-react';

// ── Content ───────────────────────────────────────────────────────────────────

const SECTIONS = [
  {
    icon: LayoutDashboard,
    title: 'Dashboard',
    color: 'blue',
    summary: 'Live snapshot of your workshop — the first screen to check every morning.',
    items: [
      { type: 'action', text: 'Click any stat box to jump to job cards filtered by that status or vehicle type' },
      { type: 'info',   text: 'Revenue chart auto-updates with the last 6 months of billing data' },
      { type: 'tip',    text: 'Check dashboard first thing every morning to see what\'s currently in progress' },
    ],
  },
  {
    icon: ClipboardList,
    title: 'Job Cards',
    color: 'emerald',
    summary: 'The core of the workshop — every vehicle visit starts and ends here.',
    items: [
      { type: 'action', text: 'New Job Card → enter or scan vehicle number → customer details auto-fill' },
      { type: 'action', text: 'Add services → price auto-fills from catalogue (vehicle-type pricing applies)' },
      { type: 'action', text: 'Assign employees to each service from the job card detail page' },
      { type: 'action', text: 'Product Usage → pick from inventory → stock decrements automatically' },
      { type: 'action', text: 'Add payments directly on the job card — balance updates in real time' },
      { type: 'action', text: 'Mark COMPLETED → triggers a WhatsApp message to the customer or garage owner' },
      { type: 'tip',    text: 'Garage job cards are grouped by garage owner under the Garage tab' },
    ],
  },
  {
    icon: Users,
    title: 'Customers & Vehicles',
    color: 'violet',
    summary: 'Customer profiles linked to their vehicles and full service history.',
    items: [
      { type: 'action', text: 'Add customer → then add their vehicle(s) — one customer can own many vehicles' },
      { type: 'info',   text: 'Next service date is auto-set 6 months after every completed job card' },
      { type: 'info',   text: 'Full service history is visible per vehicle — tap a vehicle to explore it' },
      { type: 'tip',    text: 'Link a customer to a Garage Owner to mark them as a B2B client' },
    ],
  },
  {
    icon: Wrench,
    title: 'Services',
    color: 'amber',
    summary: 'Your service catalogue with per-vehicle-type pricing and linked products.',
    items: [
      { type: 'action', text: 'Create services with a base price — override price per vehicle type (sedan, SUV, etc.)' },
      { type: 'action', text: 'Link consumable products to a service — they appear as planned items on every job card' },
      { type: 'tip',    text: 'Set vehicle-specific prices to avoid manual corrections on every job card' },
    ],
  },
  {
    icon: ShoppingCart,
    title: 'Sales',
    color: 'pink',
    summary: 'Standalone retail sales and auto-collected job-card product sales.',
    items: [
      { type: 'action', text: 'Record walk-in product sales not tied to any job card from the + New Sale button' },
      { type: 'info',   text: 'Products sold via job cards automatically appear in the combined sales feed' },
      { type: 'info',   text: 'Inventory decrements automatically on every sale — no manual update needed' },
      { type: 'tip',    text: 'Use the analytics panel to spot top-selling products and top-spending customers' },
    ],
  },
  {
    icon: UserCog,
    title: 'Employees',
    color: 'cyan',
    summary: 'Staff profiles, attendance tracking, and monthly payroll.',
    items: [
      { type: 'action', text: 'Add employee → assign a Shift (defines work hours, grace period, overtime threshold)' },
      { type: 'action', text: 'Mark daily attendance — status (present, late, absent) auto-computes from check-in/out' },
      { type: 'action', text: 'Salary Advance → request → approve → auto-deducted from that month\'s salary' },
      { type: 'action', text: 'Process Salary → net pay auto-calculated (base + bonus + incentive − advances)' },
      { type: 'info',   text: 'Processing salary sends a WhatsApp notification to the employee' },
      { type: 'tip',    text: 'Set the incentive threshold in Settings — employees earn a bonus when they exceed it' },
    ],
  },
  {
    icon: Truck,
    title: 'Vendors & Inventory',
    color: 'orange',
    summary: 'Stock management for consumables, sales products, and fixed assets.',
    items: [
      { type: 'action', text: 'Add vendor → add products → add inventory batches (brand, quantity, price per batch)' },
      { type: 'action', text: 'Set Minimum Threshold per inventory item to trigger low-stock WhatsApp alerts to admin' },
      { type: 'info',   text: 'Stock auto-decrements when products are used in job cards or sold' },
      { type: 'info',   text: 'Receive new stock by creating a purchase invoice — quantity is added to inventory' },
      { type: 'tip',    text: 'Minimum threshold at 0 (default) = alert only when fully out of stock' },
    ],
  },
  {
    icon: TrendingUp,
    title: 'Finance',
    color: 'indigo',
    summary: 'Garage-wise outstanding balances and bulk payment distribution.',
    items: [
      { type: 'info',   text: 'Shows the outstanding balance per garage owner across all their job cards' },
      { type: 'action', text: 'Enter a payment amount → auto-distributed across outstanding cards (oldest-first)' },
      { type: 'info',   text: 'Payment sends a WhatsApp confirmation to the garage owner automatically' },
    ],
  },
  {
    icon: ScanLine,
    title: 'Kiosk',
    color: 'teal',
    summary: 'Customer-facing self-service status screen for your reception.',
    items: [
      { type: 'action', text: 'Leave this open on a tablet or monitor at your front desk' },
      { type: 'info',   text: 'Customer types their vehicle number → sees live job card status instantly' },
      { type: 'tip',    text: 'No login required — customers can check their own status without staff help' },
    ],
  },
  {
    icon: Bell,
    title: 'Notifications',
    color: 'yellow',
    summary: 'WhatsApp message queue — verify records before Meta integration goes live.',
    items: [
      { type: 'info',   text: 'Every outgoing WhatsApp message is queued here as Pending before dispatch' },
      { type: 'action', text: 'Filter by Failed to quickly spot any delivery issues' },
      { type: 'info',   text: 'Toggle each notification type ON or OFF individually from Settings' },
      { type: 'tip',    text: 'Run service reminders with: python manage.py run_notification_jobs' },
    ],
  },
  {
    icon: Settings2,
    title: 'Settings',
    color: 'gray',
    summary: 'Business details, workshop defaults, and notification controls.',
    items: [
      { type: 'action', text: 'Business Info → name, phone, address — used on job cards and in WhatsApp messages' },
      { type: 'action', text: 'Notification Toggles → enable or disable each WhatsApp notification individually' },
      { type: 'action', text: 'Admin WhatsApp Number → the phone that receives low-stock inventory alerts' },
      { type: 'tip',    text: 'All settings take effect immediately — no server restart needed' },
    ],
  },
];

// ── Color system (explicit strings — Tailwind-safe) ───────────────────────────

const C = {
  blue:    { bg: 'bg-blue-500/10',    border: 'border-blue-500/25',    text: 'text-blue-400',    active: 'bg-blue-500/15 border-blue-500/30 text-blue-300'    },
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', text: 'text-emerald-400', active: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' },
  violet:  { bg: 'bg-violet-500/10',  border: 'border-violet-500/25',  text: 'text-violet-400',  active: 'bg-violet-500/15 border-violet-500/30 text-violet-300'  },
  amber:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/25',   text: 'text-amber-400',   active: 'bg-amber-500/15 border-amber-500/30 text-amber-300'   },
  pink:    { bg: 'bg-pink-500/10',    border: 'border-pink-500/25',    text: 'text-pink-400',    active: 'bg-pink-500/15 border-pink-500/30 text-pink-300'    },
  cyan:    { bg: 'bg-cyan-500/10',    border: 'border-cyan-500/25',    text: 'text-cyan-400',    active: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'    },
  orange:  { bg: 'bg-orange-500/10',  border: 'border-orange-500/25',  text: 'text-orange-400',  active: 'bg-orange-500/15 border-orange-500/30 text-orange-300'  },
  indigo:  { bg: 'bg-indigo-500/10',  border: 'border-indigo-500/25',  text: 'text-indigo-400',  active: 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'  },
  teal:    { bg: 'bg-teal-500/10',    border: 'border-teal-500/25',    text: 'text-teal-400',    active: 'bg-teal-500/15 border-teal-500/30 text-teal-300'    },
  yellow:  { bg: 'bg-yellow-500/10',  border: 'border-yellow-500/25',  text: 'text-yellow-400',  active: 'bg-yellow-500/15 border-yellow-500/30 text-yellow-300'  },
  gray:    { bg: 'bg-gray-500/10',    border: 'border-gray-500/25',    text: 'text-gray-400',    active: 'bg-gray-500/15 border-gray-500/30 text-gray-400'    },
};

// ── Item row ──────────────────────────────────────────────────────────────────

function ItemRow({ item, color }) {
  if (item.type === 'tip') {
    return (
      <div className="flex items-start gap-2.5 bg-amber-500/8 border border-amber-500/20 rounded-lg px-3.5 py-2.5">
        <Lightbulb size={13} className="text-amber-400 shrink-0 mt-0.5" />
        <span className="text-sm text-amber-200/80 leading-relaxed">{item.text}</span>
      </div>
    );
  }

  if (item.type === 'action') {
    return (
      <div className="flex items-start gap-2.5 py-1">
        <ArrowRight size={13} className={`shrink-0 mt-1 ${C[color].text}`} />
        <span className="text-sm text-gray-200 leading-relaxed">{item.text}</span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 py-1">
      <Zap size={13} className="shrink-0 mt-1 text-gray-500" />
      <span className="text-sm text-gray-400 leading-relaxed">{item.text}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UserGuide() {
  const [selected, setSelected] = useState(0);
  const [query, setQuery]       = useState('');

  const filtered = query.trim()
    ? SECTIONS.filter(s =>
        s.title.toLowerCase().includes(query.toLowerCase()) ||
        s.summary.toLowerCase().includes(query.toLowerCase()) ||
        s.items.some(i => i.text.toLowerCase().includes(query.toLowerCase()))
      )
    : SECTIONS;

  const section = filtered.find((_, i) => i === selected) ?? filtered[0];

  return (
    <div className="flex flex-col h-full">

      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-100 flex items-center gap-2">
            <BookOpen size={20} className="text-accent" />
            User Guide
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Quick reference for every module in Detailing CRM</p>
        </div>

        {/* Search */}
        <div className="relative w-56">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0); }}
            placeholder="Search topics…"
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-bg-elev text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent/50"
          />
        </div>
      </div>

      {/* Layout */}
      <div className="flex gap-4 min-h-0 flex-1">

        {/* Sidebar nav */}
        <nav className="w-48 shrink-0 space-y-0.5 overflow-y-auto">
          {filtered.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === selected;
            return (
              <button
                key={s.title}
                onClick={() => setSelected(i)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-sm transition-colors border ${
                  isActive
                    ? `${C[s.color].active} border-opacity-50`
                    : 'border-transparent text-gray-400 hover:text-gray-100 hover:bg-bg-hover'
                }`}
              >
                <Icon size={14} className={isActive ? '' : 'text-gray-500'} />
                <span className="font-medium">{s.title}</span>
              </button>
            );
          })}

          {filtered.length === 0 && (
            <p className="text-xs text-gray-600 px-3 pt-2">No results</p>
          )}
        </nav>

        {/* Content panel */}
        {section ? (
          <div className="flex-1 overflow-y-auto">
            <div className={`rounded-2xl border ${C[section.color].border} overflow-hidden`}>

              {/* Section header */}
              <div className={`${C[section.color].bg} px-6 py-5 flex items-start gap-4`}>
                <div className={`w-12 h-12 rounded-xl ${C[section.color].bg} border ${C[section.color].border} flex items-center justify-center shrink-0`}>
                  <section.icon size={22} className={C[section.color].text} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-100">{section.title}</h2>
                  <p className="text-sm text-gray-400 mt-0.5 leading-relaxed">{section.summary}</p>
                </div>
              </div>

              {/* Items */}
              <div className="px-6 py-5 space-y-2 bg-bg-card">

                {/* Legend */}
                <div className="flex items-center gap-4 mb-4 pb-3 border-b border-border">
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <ArrowRight size={11} className={C[section.color].text} /> Action
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Zap size={11} className="text-gray-500" /> Good to know
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Lightbulb size={11} className="text-amber-400" /> Pro tip
                  </span>
                </div>

                {section.items.map((item, i) => (
                  <ItemRow key={i} item={item} color={section.color} />
                ))}
              </div>

            </div>

            {/* Page counter */}
            <p className="text-xs text-gray-600 text-right mt-3">
              {(filtered.findIndex(s => s.title === section.title) + 1)} of {filtered.length} modules
            </p>
          </div>
        ) : null}

      </div>
    </div>
  );
}
