import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  CalendarDays,
  CheckSquare,
  Columns3,
  Contrast,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
  Timer,
  X,
  Zap,
} from 'lucide-react';
import { TasklyLogo } from '../brand/TasklyLogo.jsx';
import { useUiStore } from '../../stores/useUiStore.js';
import { useAuthStore } from '../../stores/useAuthStore.js';
import { useTimerStore } from '../../stores/useTimerStore.js';
import { formatSecondsClock } from '../../utils/dateUtils.js';
import { repo } from '../../services/repositories/index.js';
import { useQueryClient } from '@tanstack/react-query';
import { acquireBodyScrollLock } from '../ui/Modal.jsx';

const NAV_GROUPS = [
  {
    label: 'Workspace',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/tasks', label: 'My Tasks', icon: CheckSquare },
      { to: '/board', label: 'Kanban Board', icon: Columns3 },
    ],
  },
  {
    label: 'Eksekusi',
    items: [
      { to: '/sprints', label: 'Sprints', icon: Zap },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays },
      { to: '/focus', label: 'Focus Mode', icon: Timer },
    ],
  },
  {
    label: 'Sistem',
    items: [
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

const MOBILE_DOCK_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard },
  { to: '/board', label: 'Kanban Board', shortLabel: 'Board', icon: Columns3 },
  { to: '/analytics', label: 'Analytics', shortLabel: 'Stats', icon: BarChart3 },
  { to: '/settings', label: 'Settings', shortLabel: 'Profil', icon: Settings },
];

function NavGroupList({ collapsed, onNavigate }) {
  return (
    <nav aria-label="Navigasi utama" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          {!collapsed && (
            <p className="mb-2 px-3 text-[11px] font-semibold tracking-wider text-[var(--color-text-muted)] uppercase">
              {group.label}
            </p>
          )}
          <ul className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `group relative flex min-h-[44px] md:min-h-[40px] items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm transition-colors duration-[var(--duration-fast)] ${
                        collapsed ? 'justify-center px-0' : ''
                      } ${
                        isActive
                          ? 'bg-[var(--color-secondary)] text-[var(--color-text-primary)] font-semibold'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)] font-medium'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span
                            aria-hidden="true"
                            className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-[var(--color-primary)]"
                          />
                        )}
                        <Icon
                          className={`h-[18px] w-[18px] shrink-0 ${
                            isActive
                              ? 'text-[var(--color-accent-text)]'
                              : 'text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)]'
                          }`}
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const timerStatus = useTimerStore((s) => s.status);
  const remainingSec = useTimerStore((s) => s.remainingSec);
  const queryClient = useQueryClient();
  const isLocalMode = repo.mode === 'local';

  async function handleThemeToggle() {
    const next = toggleTheme();
    try {
      await repo.settings.update({ theme: next });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    } catch {
      // local preference already applied
    }
  }

  async function handleLogout() {
    queryClient.clear();
    await logout();
  }

  return (
    <aside
      className={`hidden md:sticky md:top-0 md:flex md:h-[100dvh] flex-col shrink-0 overflow-x-hidden overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-bg)] transition-[width] duration-[var(--duration-normal)] ease-[var(--ease-standard)] ${
        collapsed ? 'w-[72px]' : 'w-[248px]'
      }`}
    >
      <div
        className={`flex h-16 items-center border-b border-[var(--color-border)] px-3.5 ${
          collapsed ? 'justify-center' : 'justify-between'
        }`}
      >
        <NavLink to="/dashboard" aria-label="TASKLY Dashboard" className="inline-flex items-center">
          <TasklyLogo variant={collapsed ? 'mark' : 'lockup'} size="sm" />
        </NavLink>
        {!collapsed && (
          <button
            type="button"
            onClick={toggleSidebar}
            aria-expanded={!collapsed}
            aria-label="Kecilkan sidebar"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]"
          >
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </div>

      {collapsed && (
        <div className="flex justify-center border-b border-[var(--color-border)] py-2.5">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-expanded={!collapsed}
            aria-label="Perluas sidebar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]"
          >
            <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      )}

      {(timerStatus === 'running' || timerStatus === 'paused') && (
        <div className="px-3 pt-3">
          <NavLink
            to="/focus"
            title="Kembali ke Focus Mode"
            className={`flex items-center rounded-[var(--radius-md)] border border-[var(--color-border-warm)] bg-[var(--color-surface-warm)] px-3 py-2 text-xs font-medium text-[var(--color-accent-text)] ${
              collapsed ? 'justify-center px-1' : 'justify-between'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              {!collapsed && <span>{timerStatus === 'running' ? 'Fokus Aktif' : 'Dijeda'}</span>}
            </span>
            {!collapsed && <span className="font-mono-num font-semibold">{formatSecondsClock(remainingSec)}</span>}
          </NavLink>
        </div>
      )}

      <NavGroupList collapsed={collapsed} />

      <div className="space-y-1.5 border-t border-[var(--color-border)] p-3">
        <button
          type="button"
          onClick={handleThemeToggle}
          aria-label={theme === 'light' ? 'Beralih ke Tema Monochrome' : 'Beralih ke Tema Light Workspace'}
          title={collapsed ? (theme === 'light' ? 'Tema: Monochrome' : 'Tema: Light Workspace') : undefined}
          className={`flex min-h-[40px] w-full items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)] ${
            collapsed ? 'justify-center px-0' : ''
          }`}
        >
          {theme === 'light' ? (
            <Contrast className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Sun className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
          )}
          {!collapsed && <span className="whitespace-nowrap">{theme === 'light' ? 'Tema: Monochrome' : 'Tema: Light Workspace'}</span>}
        </button>

        <div className={`flex items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-2 ${collapsed ? 'justify-center px-0' : 'justify-between'}`}>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[var(--color-text-primary)]">{user?.full_name || 'Pengguna'}</p>
              <p className="truncate text-[11px] text-[var(--color-text-muted)]">
                {isLocalMode ? 'Penyimpanan Lokal (Browser)' : user?.email}
              </p>
            </div>
          )}
          {!isLocalMode && (
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Keluar dari akun"
              title="Keluar"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

export function MobileBottomDock() {
  return (
    <nav
      aria-label="Navigasi cepat mobile"
      className="liquid-glass fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-40 mx-auto max-w-md rounded-full border p-1.5 md:hidden"
    >
      <ul className="flex items-center justify-between gap-1">
        {MOBILE_DOCK_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.to} className="flex-1 flex justify-center">
              <NavLink
                to={item.to}
                aria-label={item.label}
                className={({ isActive }) =>
                  `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full transition-all duration-[var(--duration-fast)] ${
                    isActive
                      ? 'w-full bg-[var(--color-primary)] px-3.5 text-xs font-semibold text-[var(--color-on-primary)]'
                      : 'w-11 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    {isActive && <span className="truncate">{item.shortLabel}</span>}
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function MobileNavSheet({ open, onClose, returnFocusRef }) {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();
  const isLocalMode = repo.mode === 'local';

  const [rendered, setRendered] = useState(open);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (!rendered) return undefined;
    return acquireBodyScrollLock();
  }, [rendered]);

  useEffect(() => {
    if (open) {
      setRendered(true);
      setIsClosing(false);
    } else if (rendered) {
      setIsClosing(true);
      const timer = setTimeout(() => {
        setRendered(false);
        setIsClosing(false);
      }, 190);
      return () => clearTimeout(timer);
    }
  }, [open, rendered]);

  function closeSheet() {
    onClose();
    setTimeout(() => returnFocusRef?.current?.focus?.(), 210);
  }

  async function handleThemeToggle() {
    const next = toggleTheme();
    try {
      await repo.settings.update({ theme: next });
    } catch {
      // ignore
    }
  }

  async function handleLogout() {
    queryClient.clear();
    await logout();
  }

  if (!rendered) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex md:hidden bg-black/55 backdrop-blur-[2px] ${
        isClosing ? 'drawer-backdrop-exit pointer-events-none' : 'drawer-backdrop-enter'
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeSheet();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu navigasi"
        className={`flex h-[100dvh] w-72 max-w-[85vw] flex-col border-r border-[var(--color-border)] bg-[var(--color-bg)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-2xl ${
          isClosing ? 'drawer-panel-exit' : 'drawer-panel-enter'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-[var(--color-border)] px-4">
          <TasklyLogo variant="lockup" size="sm" />
          <button
            type="button"
            onClick={closeSheet}
            aria-label="Tutup menu navigasi"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-transform active:scale-95 hover:bg-[var(--color-surface)]"
          >
            <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <NavGroupList collapsed={false} onNavigate={closeSheet} />

        <div className="space-y-2 border-t border-[var(--color-border)] p-3">
          <button
            type="button"
            onClick={handleThemeToggle}
            className="flex min-h-[44px] w-full items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]"
          >
            {theme === 'light' ? (
              <Contrast className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Sun className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            )}
            <span>{theme === 'light' ? 'Tema: Monochrome' : 'Tema: Light Workspace'}</span>
          </button>
          <div className="flex items-center justify-between px-3 py-1.5">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[var(--color-text-primary)]">{user?.full_name || 'Pengguna'}</p>
              <p className="truncate text-[11px] text-[var(--color-text-muted)]">
                {isLocalMode ? 'Penyimpanan Lokal (Browser)' : user?.email}
              </p>
            </div>
            {!isLocalMode && (
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Keluar dari akun"
                className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
