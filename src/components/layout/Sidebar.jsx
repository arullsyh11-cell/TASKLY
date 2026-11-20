import { useEffect, useRef, useState } from 'react';
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
    label: 'Execution',
    items: [
      { to: '/sprints', label: 'Sprints', icon: Zap },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays },
      { to: '/focus', label: 'Focus Mode', icon: Timer },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

const RADIAL_ITEMS = [
  { to: '/sprints', label: 'Sprints', shortLabel: 'Sprints', icon: Zap, desktopAngle: -90 },
  { to: '/calendar', label: 'Calendar', shortLabel: 'Calendar', icon: CalendarDays, desktopAngle: -18 },
  { to: '/focus', label: 'Focus Mode', shortLabel: 'Focus', icon: Timer, desktopAngle: 54 },
  { to: '/analytics', label: 'Analytics', shortLabel: 'Analytics', icon: BarChart3, desktopAngle: 126 },
  { to: '/settings', label: 'Settings', shortLabel: 'Settings', icon: Settings, desktopAngle: 198 },
];

const MOBILE_DOCK_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard },
  { to: '/board', label: 'Kanban Board', shortLabel: 'Board', icon: Columns3 },
  { to: '/analytics', label: 'Analytics', shortLabel: 'Stats', icon: BarChart3 },
  { to: '/settings', label: 'Settings', shortLabel: 'Settings', icon: Settings },
];

function NavGroupList({ collapsed, onNavigate }) {
  return (
    <nav aria-label="Primary navigation" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
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
  const navStyle = useUiStore((s) => s.navStyle);
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

  if (navStyle !== 'sidebar') return null;

  async function handleThemeToggle() {
    const next = toggleTheme();
    try {
      await repo.settings.update({ theme: next });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    } catch {
      // ignore
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
            aria-label="Collapse sidebar"
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
            aria-label="Expand sidebar"
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
            title="Return to Focus Mode"
            className={`flex items-center rounded-[var(--radius-md)] border border-[var(--color-border-warm)] bg-[var(--color-surface-warm)] px-3 py-2 text-xs font-medium text-[var(--color-accent-text)] ${
              collapsed ? 'justify-center px-1' : 'justify-between'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              {!collapsed && <span>{timerStatus === 'running' ? 'Focus Active' : 'Paused'}</span>}
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
          aria-label={theme === 'light' ? 'Switch to Monochrome theme' : 'Switch to Light Workspace theme'}
          title={collapsed ? (theme === 'light' ? 'Theme: Monochrome' : 'Theme: Light Workspace') : undefined}
          className={`flex min-h-[40px] w-full items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)] ${
            collapsed ? 'justify-center px-0' : ''
          }`}
        >
          {theme === 'light' ? (
            <Contrast className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Sun className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
          )}
          {!collapsed && <span className="whitespace-nowrap">{theme === 'light' ? 'Theme: Monochrome' : 'Theme: Light Workspace'}</span>}
        </button>

        <div className={`flex items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-2 ${collapsed ? 'justify-center px-0' : 'justify-between'}`}>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[var(--color-text-primary)]">{user?.full_name || 'User'}</p>
              <p className="truncate text-[11px] text-[var(--color-text-muted)]">
                {isLocalMode ? 'Local Storage (Browser)' : user?.email}
              </p>
            </div>
          )}
          {!isLocalMode && (
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Sign out"
              title="Sign out"
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
      aria-label="Quick mobile navigation"
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

function SlideNavDrawer({ open, onClose, returnFocusRef }) {
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
      return undefined;
    }
    if (rendered) {
      setIsClosing(true);
      const timer = setTimeout(() => {
        setRendered(false);
        setIsClosing(false);
      }, 190);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [open, rendered]);

  function closeSheet() {
    onClose();
    setTimeout(() => returnFocusRef?.current?.focus?.(), 210);
  }

  async function handleThemeToggle() {
    const next = toggleTheme();
    try {
      await repo.settings.update({ theme: next });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
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
        aria-label="Navigation menu"
        className={`flex h-[100dvh] w-72 max-w-[85vw] flex-col border-r border-[var(--color-border)] bg-[var(--color-bg)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-2xl ${
          isClosing ? 'drawer-panel-exit' : 'drawer-panel-enter'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-[var(--color-border)] px-4">
          <TasklyLogo variant="lockup" size="sm" />
          <button
            type="button"
            onClick={closeSheet}
            aria-label="Close navigation menu"
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
            <span>{theme === 'light' ? 'Theme: Monochrome' : 'Theme: Light Workspace'}</span>
          </button>
          <div className="flex items-center justify-between px-3 py-1.5">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[var(--color-text-primary)]">{user?.full_name || 'User'}</p>
              <p className="truncate text-[11px] text-[var(--color-text-muted)]">
                {isLocalMode ? 'Local Storage (Browser)' : user?.email}
              </p>
            </div>
            {!isLocalMode && (
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Sign out"
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

function RadialNavSheet({ open, onClose, returnFocusRef }) {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const timerStatus = useTimerStore((s) => s.status);
  const remainingSec = useTimerStore((s) => s.remainingSec);
  const queryClient = useQueryClient();
  const isLocalMode = repo.mode === 'local';
  const containerRef = useRef(null);

  const [rendered, setRendered] = useState(open);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (open) {
      setRendered(true);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          setExpanded(true);
        });
      });
      return () => {
        cancelAnimationFrame(raf1);
        if (raf2) cancelAnimationFrame(raf2);
      };
    }
    if (rendered) {
      setExpanded(false);
      const timer = setTimeout(() => {
        setRendered(false);
      }, 250);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [open, rendered]);

  // Close when clicking outside the radial sidebar without blocking/covering the page with a fullscreen overlay
  useEffect(() => {
    if (!open) return undefined;
    function handleOutsideMouseDown(e) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target) &&
        !returnFocusRef?.current?.contains(e.target)
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleOutsideMouseDown);
    return () => document.removeEventListener('mousedown', handleOutsideMouseDown);
  }, [open, onClose, returnFocusRef]);

  function closeSheet() {
    onClose();
    setTimeout(() => returnFocusRef?.current?.focus?.(), 260);
  }

  async function handleThemeToggle() {
    const next = toggleTheme();
    try {
      await repo.settings.update({ theme: next });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    } catch {
      // ignore
    }
  }

  async function handleLogout() {
    queryClient.clear();
    await logout();
  }

  if (!rendered) return null;

  // Compact mobile semicircle radius (122px inside a 172x336 semicircle stage)
  const mobileRadius = 122;
  const desktopRadius = 134;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="false"
      aria-label="Navigation menu"
      className={`fixed left-0 md:left-5 top-1/2 z-50 -translate-y-1/2 flex flex-col items-start md:items-center gap-3 ${
        expanded ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      {/* Compact Half-Circle on Mobile (<768px) anchored to left edge; Full Circle on Web (>=768px) docked on the left */}
      <nav
        aria-label="Primary navigation"
        className={`radial-stage relative h-[336px] w-[172px] rounded-r-[168px] border-y border-r border-[var(--color-border-strong)] md:h-[384px] md:w-[384px] md:rounded-full md:border select-none overflow-visible ${
          expanded ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
        }`}
      >
        {/* Compact Mobile Half-Circle Dashed Orbit SVG (<768px) */}
        <svg
          viewBox="0 0 172 336"
          aria-hidden="true"
          className={`radial-ring-svg pointer-events-none absolute inset-0 h-full w-full md:hidden ${
            expanded ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
          }`}
        >
          <circle
            cx="18"
            cy="168"
            r={mobileRadius}
            fill="none"
            stroke="var(--radial-ring-stroke)"
            strokeWidth="1.75"
            strokeDasharray="5 6"
            strokeLinecap="round"
          />
          <circle
            cx="18"
            cy="168"
            r="36"
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="1"
            strokeOpacity="0.65"
          />
        </svg>

        {/* Web/Desktop Full-Circle Dashed Orbit SVG (>=768px) */}
        <svg
          viewBox="0 0 384 384"
          aria-hidden="true"
          className={`radial-ring-svg pointer-events-none absolute inset-0 hidden h-full w-full md:block ${
            expanded ? 'scale-100 rotate-0 opacity-100' : 'scale-50 -rotate-12 opacity-0'
          }`}
        >
          <circle
            cx="192"
            cy="192"
            r={desktopRadius}
            fill="none"
            stroke="var(--radial-ring-stroke)"
            strokeWidth="2"
            strokeDasharray="7 8"
            strokeLinecap="round"
          />
          <circle
            cx="192"
            cy="192"
            r="56"
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="1.25"
            strokeOpacity="0.6"
          />
        </svg>

        {/* 5 Satellite Navigation Nodes (Sprints, Calendar, Focus Mode, Analytics, Settings) */}
        <ul className="contents">
          {RADIAL_ITEMS.map((item, idx) => {
            const Icon = item.icon;
            // Mobile semicircle angle: -72 deg (top) to +72 deg (bottom), 36 deg step for 5 nodes
            const mobileAngleDeg = -72 + idx * 36;
            const mRad = (mobileAngleDeg * Math.PI) / 180;
            const mx = `${(Math.cos(mRad) * mobileRadius).toFixed(1)}px`;
            const my = `${(Math.sin(mRad) * mobileRadius).toFixed(1)}px`;

            // Desktop full-circle angle: -90 deg (top) clockwise 72 deg step for 5 nodes
            const dRad = (item.desktopAngle * Math.PI) / 180;
            const dx = `${(Math.cos(dRad) * desktopRadius).toFixed(1)}px`;
            const dy = `${(Math.sin(dRad) * desktopRadius).toFixed(1)}px`;

            const delayMs = expanded ? idx * 18 : (RADIAL_ITEMS.length - 1 - idx) * 10;

            return (
              <li
                key={item.to}
                style={{
                  '--mx': mx,
                  '--my': my,
                  '--dx': dx,
                  '--dy': dy,
                  transitionDelay: `${delayMs}ms`,
                }}
                className={`radial-node absolute left-[18px] top-1/2 -ml-[17px] -mt-[17px] md:left-1/2 md:-ml-[27px] md:-mt-[27px] ${
                  expanded ? 'radial-node-open' : 'radial-node-closed'
                }`}
              >
                <NavLink
                  to={item.to}
                  onClick={closeSheet}
                  aria-label={item.label}
                  title={item.label}
                  className={({ isActive }) =>
                    `radial-disc group relative flex h-[34px] w-[34px] md:h-[54px] md:w-[54px] items-center justify-center rounded-full after:absolute after:-inset-1.5 after:content-[''] ${
                      isActive
                        ? 'radial-disc-active text-[var(--color-accent-text)]'
                        : 'text-[var(--color-text-primary)] hover:text-[var(--color-accent-text)]'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className="h-[15px] w-[15px] md:h-5 md:w-5 shrink-0" strokeWidth={1.85} aria-hidden="true" />
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none absolute -bottom-3 md:-bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border px-1.5 py-0 text-[8px] leading-[13px] md:py-[0.5px] md:text-[10.5px] md:leading-tight font-semibold shadow-xs transition-colors ${
                          isActive
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                            : 'border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] group-hover:border-[var(--color-primary)] group-hover:text-[var(--color-text-primary)]'
                        }`}
                      >
                        {item.shortLabel}
                      </span>
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>

        {/* Mobile Inner-Arc Quick Theme Switcher (<768px) */}
        <button
          type="button"
          onClick={handleThemeToggle}
          aria-label={theme === 'light' ? 'Switch to Monochrome theme' : 'Switch to Light Workspace theme'}
          title={theme === 'light' ? 'Theme: Monochrome' : 'Theme: Light Workspace'}
          className={`absolute left-[68px] top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] text-[var(--color-accent-text)] shadow-md transition-all duration-300 md:hidden ${
            expanded ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
          }`}
        >
          {theme === 'light' ? (
            <Contrast className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Sun className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          )}
        </button>

        {/* Center Glowing Close Hub (X) - at (18px, 50%) on Mobile Half-Circle, and (50%, 50%) on Desktop Circle */}
        <button
          type="button"
          onClick={closeSheet}
          aria-label="Close navigation menu"
          className={`radial-hub absolute left-[18px] top-1/2 z-10 -ml-5 -mt-5 inline-flex h-10 w-10 md:left-1/2 md:-ml-8 md:-mt-8 md:h-16 md:w-16 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-on-primary)] active:scale-95 hover:bg-[var(--color-primary-hover)] ${
            expanded ? 'scale-100 rotate-0 opacity-100' : 'scale-50 -rotate-90 opacity-0'
          }`}
        >
          <X className="h-4 w-4 md:h-7 md:w-7" strokeWidth={2.25} aria-hidden="true" />
        </button>
      </nav>

      {/* Compact Desktop Utility Pill Under the Left-Docked Radial Wheel */}
      <div
        className={`hidden md:flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/95 px-3 py-1.5 shadow-lg transition-all duration-300 ${
          expanded ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
        }`}
      >
        <button
          type="button"
          onClick={handleThemeToggle}
          aria-label={theme === 'light' ? 'Switch to Monochrome theme' : 'Switch to Light Workspace theme'}
          className="inline-flex min-h-[34px] items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-semibold text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-border-strong)]"
        >
          {theme === 'light' ? (
            <Contrast className="h-3.5 w-3.5 text-[var(--color-accent-text)]" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Sun className="h-3.5 w-3.5 text-[var(--color-accent-text)]" strokeWidth={1.75} aria-hidden="true" />
          )}
          <span>{theme === 'light' ? 'Theme: Monochrome' : 'Theme: Light Workspace'}</span>
        </button>

        {(timerStatus === 'running' || timerStatus === 'paused') && (
          <NavLink
            to="/focus"
            onClick={closeSheet}
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-[var(--color-border-warm)] bg-[var(--color-surface-warm)] px-3 text-xs font-semibold text-[var(--color-accent-text)]"
          >
            <Timer className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            <span className="font-mono-num">{formatSecondsClock(remainingSec)}</span>
          </NavLink>
        )}

        <div className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs">
          <span className="font-semibold text-[var(--color-text-primary)]">{user?.full_name || 'User'}</span>
          <span className="text-[11px] text-[var(--color-text-muted)]">({isLocalMode ? 'Local' : user?.email})</span>
          {!isLocalMode && (
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Sign out"
              className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function MobileNavSheet(props) {
  const navStyle = useUiStore((s) => s.navStyle);
  if (navStyle === 'sidebar') {
    return <SlideNavDrawer {...props} />;
  }
  return <RadialNavSheet {...props} />;
}
