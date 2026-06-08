import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Users, Wrench,
  UserCog, Truck, ScanLine, Sparkles, LogOut, User, TrendingUp, Settings2, X, ShoppingCart,
} from 'lucide-react';
import { tokens, logout } from '../api/auth';

const ALL_LINKS = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard',          end: true,  staffAllowed: true  },
  { to: '/jobcards',  icon: ClipboardList,   label: 'Job Cards',          end: false, staffAllowed: true  },
  { to: '/customers', icon: Users,           label: 'Customers / Vehicles', end: false, staffAllowed: true },
  { to: '/services',  icon: Wrench,          label: 'Services',           end: false, staffAllowed: false },
  { to: '/sales',     icon: ShoppingCart,    label: 'Sales',              end: false, staffAllowed: true  },
  { to: '/employees', icon: UserCog,         label: 'Employees',          end: false, staffAllowed: false },
  { to: '/vendors',   icon: Truck,           label: 'Vendors',            end: false, staffAllowed: false },
  { to: '/finance',   icon: TrendingUp,      label: 'Finance',            end: false, staffAllowed: false },
  { to: '/kiosk',     icon: ScanLine,        label: 'Kiosk',              end: false, staffAllowed: true  },
  { to: '/settings',  icon: Settings2,       label: 'Settings',           end: false, staffAllowed: false },
];

export default function Sidebar({ onClose }) {
  const navigate     = useNavigate();
  const username     = tokens.getUser();
  const role         = tokens.getRole();
  const isStaff      = role === 'staff';
  const employeeName = tokens.getEmployeeName();

  const links = isStaff ? ALL_LINKS.filter(l => l.staffAllowed) : ALL_LINKS;

  const onLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <aside className="w-64 shrink-0 bg-bg-card border-r border-border flex flex-col h-full">
      {/* Logo + mobile close */}
      <div className="px-5 py-5 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
            <Sparkles size={18} className="text-accent" />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-100 leading-tight">Detailing CRM</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Workshop</div>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1 text-gray-500 hover:text-gray-100 transition-colors"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-accent-soft text-accent border border-accent/30'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-bg-hover border border-transparent'
              }`
            }
          >
            <link.icon size={16} className="shrink-0" />
            <span className="truncate">{link.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User + role badge + logout */}
      <div className="px-3 py-3 border-t border-border space-y-2">
        {username && (
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-gray-400">
            <div className="w-7 h-7 rounded-full bg-bg-elev flex items-center justify-center shrink-0">
              <User size={13} />
            </div>
            <div className="min-w-0">
              {/* Show employee name as primary if mapped, otherwise show username */}
              <div className="truncate font-medium text-gray-200">
                {employeeName || username}
              </div>
              {employeeName && (
                <div className="truncate text-[10px] text-gray-500">{username}</div>
              )}
              {isStaff && (
                <div className="text-[10px] text-amber-400 font-medium uppercase tracking-wide">Staff</div>
              )}
            </div>
          </div>
        )}
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-400 hover:text-red-300 hover:bg-red-900/20 transition-colors"
        >
          <LogOut size={16} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
