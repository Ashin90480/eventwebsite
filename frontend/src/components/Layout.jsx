import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, CalendarDays, LayoutDashboard, LogOut, Menu, QrCode, ScanLine, Settings, Users, X } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { useEvent } from '../eventContext.jsx';
import { EVENT_STATUS } from '../format.js';
import { Badge, Logo, cx } from './ui.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/events', label: 'Events', icon: CalendarDays },
  { to: '/participants', label: 'Participants', icon: Users, needsEvent: true },
  { to: '/qr-codes', label: 'QR codes', icon: QrCode, needsEvent: true },
  { to: '/scanner', label: 'Scanner', icon: ScanLine, needsEvent: true },
  { to: '/reports', label: 'Reports', icon: BarChart3, needsEvent: true },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function EventPicker() {
  const { eventId, event, events, select } = useEvent();
  const navigate = useNavigate();
  return (
    <div className="px-3">
      <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">Working on</p>
      <select
        value={eventId}
        onChange={(e) => {
          select(e.target.value);
          if (e.target.value) navigate('/participants');
        }}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
        aria-label="Current event"
      >
        <option value="" className="text-ink">Select an event…</option>
        {events.map((e) => (
          <option key={e.id} value={e.id} className="text-ink">
            {e.name}
          </option>
        ))}
      </select>
      {event && (
        <div className="mt-2 flex items-center gap-2 px-1">
          <Badge tone={EVENT_STATUS[event.status]?.tone} dot>
            {EVENT_STATUS[event.status]?.label}
          </Badge>
        </div>
      )}
    </div>
  );
}

function SidebarBody({ onNavigate }) {
  const { user, logout } = useAuth();
  const { eventId } = useEvent();
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-5 pt-6">
        <Logo light />
      </div>
      <EventPicker />
      <nav className="mt-5 flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, end, needsEvent }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                isActive ? 'bg-brand-600 text-white shadow-sm' : 'text-white/70 hover:bg-white/8 hover:text-white',
                needsEvent && !eventId && 'opacity-60',
              )
            }
          >
            <Icon className="size-[18px]" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">
            {(user?.name || '?').trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{user?.name}</p>
            <p className="truncate text-xs text-white/50">{user?.role === 'admin' ? 'Administrator' : 'Coordinator'}</p>
          </div>
          <button onClick={logout} title="Sign out" aria-label="Sign out" className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { event } = useEvent();

  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="min-h-screen lg:pl-64">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-ink lg:block print:hidden">
        <SidebarBody />
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden print:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100">
          <Menu className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{event?.name || 'EventQR'}</p>
        </div>
        <NavLink to="/scanner" className="rounded-lg bg-brand-600 p-2 text-white" aria-label="Open scanner">
          <ScanLine className="size-4" />
        </NavLink>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden">
          <div className="absolute inset-0 bg-ink/60" onClick={() => setOpen(false)} />
          <aside className="rise absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-ink shadow-2xl">
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-3 top-4 rounded-lg p-1.5 text-white/60 hover:bg-white/10">
              <X className="size-5" />
            </button>
            <SidebarBody onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8 print:max-w-none print:p-0">
        <Outlet />
      </main>
    </div>
  );
}
