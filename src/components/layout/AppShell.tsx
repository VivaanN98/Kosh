import { m } from 'motion/react';
import { Suspense, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { ChartNoAxesColumn, House, Plus, Target, WalletCards } from 'lucide-react';
import { springs } from '@/motion/springs';
import { useBackend, useSnapshot } from '@/data/hooks';
import { useAddSheet } from '@/features/add/AddSheetContext';
import { RouteSkeleton } from './RouteSkeleton';

const NAV = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/insights', label: 'Insights', icon: ChartNoAxesColumn },
  { to: '/accounts', label: 'Accounts', icon: WalletCards },
  { to: '/plans', label: 'Plans', icon: Target },
] as const;

export function DemoBadge({ compact = false }: { compact?: boolean }) {
  const { mode } = useBackend();
  if (mode !== 'demo') return null;
  return (
    <NavLink
      to="/settings"
      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-warning-soft px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-warning"
      data-testid="demo-badge"
      title="Demo Mode: fictional data stored only on this device"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />
      {compact ? 'Demo' : 'Demo Mode'}
    </NavLink>
  );
}

function Avatar() {
  const { userEmail, mode } = useBackend();
  const snap = useSnapshot();
  const name = snap.profile?.displayName ?? userEmail ?? (mode === 'demo' ? 'Demo' : 'You');
  const initial = name.trim().charAt(0).toUpperCase() || 'K';
  return (
    <NavLink
      to="/settings"
      aria-label="Profile and settings"
      className={({ isActive }) =>
        `tap inline-flex items-center justify-center rounded-full ${isActive ? 'ring-2 ring-[var(--peri)]' : ''}`
      }
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[var(--mint-soft)] to-[var(--peri-soft)] text-[14px] font-semibold text-text shadow-[inset_0_0_0_1px_var(--line)]">
        {initial}
      </span>
    </NavLink>
  );
}

function AddButton({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const add = useAddSheet();
  const dim = size === 'lg' ? 'h-[52px] w-[52px]' : 'h-12 w-12';
  return (
    <m.button
      type="button"
      onClick={() => add.open()}
      whileTap={{ scale: 0.92 }}
      transition={springs.snappy}
      aria-label="Add transaction"
      data-testid="add-button"
      className={`${dim} inline-flex items-center justify-center rounded-[18px] bg-text text-text-inverse shadow-2`}
    >
      <Plus size={24} strokeWidth={2.2} aria-hidden="true" />
    </m.button>
  );
}

function SideNav() {
  return (
    <nav aria-label="Primary" className="fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-w)] flex-col items-center border-r border-line bg-bg-elevated py-6 md:flex">
      <NavLink to="/" aria-label="Kosh home" className="mb-8 flex h-10 w-10 items-center justify-center rounded-[13px] bg-text text-text-inverse">
        <span className="serif text-[22px] italic leading-none">k</span>
      </NavLink>
      <div className="mb-6">
        <AddButton />
      </div>
      <ul className="flex flex-col items-center gap-1.5">
        {NAV.map(({ to, label, icon: Icon, ...rest }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={'end' in rest}
              className={({ isActive }) =>
                `group relative flex h-[58px] w-[64px] flex-col items-center justify-center gap-1 rounded-[16px] text-[11px] font-medium transition-colors ${
                  isActive ? 'text-text' : 'text-text-3 hover:text-text'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <m.span layoutId="sidenav-pill" className="absolute inset-0 rounded-[16px] bg-surface-2" transition={springs.snappy} />}
                  <Icon size={21} strokeWidth={isActive ? 2 : 1.7} className="relative" aria-hidden="true" />
                  <span className="relative">{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-col items-center gap-3">
        <DemoBadge compact />
        <Avatar />
      </div>
    </nav>
  );
}

function TabBar() {
  const items = [NAV[0], NAV[1], null, NAV[2], NAV[3]] as const;
  return (
    <nav
      aria-label="Primary"
      className="glass fixed inset-x-0 bottom-0 z-40 border-x-0 border-b-0 pb-[var(--safe-bottom)] md:hidden"
      style={{ borderTop: '1px solid var(--line)' }}
    >
      <ul className="mx-auto flex h-[var(--tabbar-h)] max-w-[520px] items-center justify-around px-2">
        {items.map((item) =>
          item === null ? (
            <li key="add">
              <AddButton />
            </li>
          ) : (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={'end' in item}
                className={({ isActive }) =>
                  `relative flex h-[52px] w-[64px] flex-col items-center justify-center gap-0.5 rounded-[14px] text-[10.5px] font-medium ${
                    isActive ? 'text-text' : 'text-text-3'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon size={22} strokeWidth={isActive ? 2.1 : 1.7} aria-hidden="true" />
                    <span>{item.label}</span>
                    {isActive && (
                      <m.span layoutId="tab-dot" className="absolute bottom-0.5 h-1 w-1 rounded-full bg-text" transition={springs.snappy} />
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}

function MobileTopBar() {
  return (
    <div className="flex items-center justify-between px-4 pt-[calc(10px+var(--safe-top))] md:hidden">
      <div className="flex h-11 items-center">
        <DemoBadge />
      </div>
      <Avatar />
    </div>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const location = useLocation();
  return (
    <div className="min-h-dvh overflow-x-clip md:pl-[var(--sidebar-w)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-[12px] focus:bg-surface focus:px-4 focus:py-2 focus:shadow-2">
        Skip to content
      </a>
      <SideNav />
      <MobileTopBar />
      <Suspense key={location.pathname.split('/')[1]} fallback={<RouteSkeleton />}>
        {children ?? <Outlet />}
      </Suspense>
      <TabBar />
    </div>
  );
}
