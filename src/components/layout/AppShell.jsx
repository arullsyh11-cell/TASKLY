import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Contrast, Maximize2, Menu, Minimize2, Plus, Search, Sun, Timer, X } from 'lucide-react';
import { toast } from 'sonner';
import { MobileBottomDock, MobileNavSheet, Sidebar } from './Sidebar.jsx';
import { TasklyLogo } from '../brand/TasklyLogo.jsx';
import { useUiStore } from '../../stores/useUiStore.js';
import { useAuthStore } from '../../stores/useAuthStore.js';
import { useTimerStore } from '../../stores/useTimerStore.js';
import { QuickAddTaskModal } from '../../features/tasks/QuickAddTaskModal.jsx';
import { TaskDetailDrawer } from '../../features/tasks/TaskDetailDrawer.jsx';
import { GlobalTimerEngine } from '../../features/focus/GlobalTimerEngine.jsx';
import { FocusExpandedPopup } from '../../features/focus/FocusDynamicIsland.jsx';
import { GlobalReminderEngine } from '../../features/reminders/GlobalReminderEngine.jsx';
import { ReminderBellMenu } from '../../features/reminders/ReminderBellMenu.jsx';
import { repo } from '../../services/repositories/index.js';
import { getFullscreenElement, isStandalonePwa, toggleNativeFullscreen } from '../../utils/fullscreenUtils.js';

function GlobalSearchBar() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const openTaskDrawer = useUiStore((s) => s.openTaskDrawer);

  const { data: results = [] } = useQuery({
    queryKey: ['tasks', { globalSearch: query }],
    queryFn: () => repo.tasks.list({ search: query }),
    enabled: query.trim().length > 0,
  });

  useEffect(() => {
    function onOutside(e) {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <input
        type="search"
        aria-label="Quick search workspace tasks"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        placeholder="Search tasks or labels..."
        className="h-10 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] pl-10 pr-8 text-base sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] focus:border-[var(--color-primary)]"
      />
      {query && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setQuery('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}

      {open && query.trim().length > 0 && (
        <div
          className="absolute left-0 right-0 top-12 z-40 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] p-2"
          style={{ boxShadow: 'var(--shadow-overlay)' }}
        >
          {results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[var(--color-text-muted)]">
              No tasks found for "{query}".
            </p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {results.slice(0, 6).map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => {
                      openTaskDrawer(task.id);
                      setOpen(false);
                      setQuery('');
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-left text-xs hover:bg-[var(--color-surface)]"
                  >
                    <span className="truncate font-medium text-[var(--color-text-primary)]">{task.title}</span>
                    <span className="shrink-0 text-[11px] text-[var(--color-accent-text)]">{task.column_name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);
  const navStyle = useUiStore((s) => s.navStyle);
  const openQuickAdd = useUiStore((s) => s.openQuickAdd);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const user = useAuthStore((s) => s.user);
  const timerStatus = useTimerStore((s) => s.status);
  const isRinging = useTimerStore((s) => s.isRinging);
  const timerPopupActive =
    timerStatus === 'running' || timerStatus === 'paused' || timerStatus === 'completed' || isRinging;

  const menuBtnRef = useRef(null);
  const location = useLocation();
  const initials = (user?.full_name || 'U').trim().charAt(0).toUpperCase();
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(() => Boolean(getFullscreenElement()));
  const standaloneMode = isStandalonePwa();

  useEffect(() => {
    function syncFs() {
      setIsNativeFullscreen(Boolean(getFullscreenElement()));
    }
    document.addEventListener('fullscreenchange', syncFs);
    document.addEventListener('webkitfullscreenchange', syncFs);
    return () => {
      document.removeEventListener('fullscreenchange', syncFs);
      document.removeEventListener('webkitfullscreenchange', syncFs);
    };
  }, []);

  async function handleAppFullscreenToggle() {
    const res = await toggleNativeFullscreen();
    if (res.supported) {
      setIsNativeFullscreen(res.active);
    } else {
      toast.info('For fullscreen on this browser, tap Share > Add to Home Screen.');
    }
  }

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname, setMobileNavOpen]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && mobileNavOpen) {
        setMobileNavOpen(false);
        setTimeout(() => menuBtnRef.current?.focus?.(), 10);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileNavOpen, setMobileNavOpen]);

  async function handleTopThemeToggle() {
    const next = toggleTheme();
    try {
      await repo.settings.update({ theme: next });
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex min-h-[100dvh] bg-[var(--color-bg)] text-[var(--color-text-primary)]">
      <GlobalTimerEngine />
      <GlobalReminderEngine />
      <FocusExpandedPopup />
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar (Solid on Mobile, Frosted on Desktop) */}
        <header className="sticky top-0 z-30 flex min-h-[calc(4rem+env(safe-area-inset-top))] items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-3 pt-[env(safe-area-inset-top)] sm:gap-3 sm:px-6 lg:px-8 md:liquid-glass">
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            {navStyle === 'sidebar' && (
              <button
                ref={menuBtnRef}
                type="button"
                onClick={() => setMobileNavOpen((v) => !v)}
                aria-expanded={mobileNavOpen}
                aria-label="Open navigation menu"
                className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] transition-transform duration-150 active:scale-95 hover:border-[var(--color-border-strong)] after:absolute after:-inset-0.5 after:content-[''] md:hidden"
              >
                <Menu className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </button>
            )}
            <Link
              to="/dashboard"
              aria-label="TASKLY Dashboard"
              className={`inline-flex items-center ${navStyle === 'sidebar' ? 'md:hidden' : ''}`}
            >
              <TasklyLogo variant="lockup" size="sm" />
            </Link>
          </div>

          <div className="hidden flex-1 justify-center px-4 md:flex">
            <GlobalSearchBar />
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            <Link
              to="/focus"
              aria-label="Focus Mode"
              title="Open Focus Mode"
              className={`hidden sm:inline-flex h-10 items-center justify-center gap-2 rounded-full border px-3 text-xs font-semibold transition-colors ${
                timerStatus === 'running'
                  ? 'border-[var(--color-border-warm)] bg-[var(--color-surface-warm)] text-[var(--color-accent-text)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)]/80 text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              <Timer className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>Focus</span>
            </Link>

            <ReminderBellMenu />

            <button
              type="button"
              onClick={handleTopThemeToggle}
              aria-label={theme === 'light' ? 'Switch to Monochrome theme' : 'Switch to Light Workspace theme'}
              title={theme === 'light' ? 'Theme: Light Workspace (Click for Monochrome)' : 'Theme: Monochrome (Click for Light Workspace)'}
              className="hidden sm:inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/80 text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
            >
              {theme === 'light' ? (
                <Contrast className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <Sun className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              )}
            </button>

            {!standaloneMode && (
              <button
                type="button"
                onClick={handleAppFullscreenToggle}
                aria-label={isNativeFullscreen ? 'Exit app fullscreen' : 'Enter app fullscreen'}
                title={isNativeFullscreen ? 'Exit App Fullscreen' : 'App Fullscreen'}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] transition-colors active:scale-95 hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)] after:absolute after:-inset-0.5 after:content-['']"
              >
                {isNativeFullscreen ? (
                  <Minimize2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <Maximize2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => openQuickAdd()}
              aria-label="Quick add task"
              title="Quick add task"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-on-primary)] transition-colors active:scale-95 hover:bg-[var(--color-primary-hover)] after:absolute after:-inset-0.5 after:content-['']"
            >
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </button>

            <Link
              to="/settings"
              aria-label="Workspace Profile"
              title={user?.full_name || 'Workspace Profile'}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border-warm)] bg-[var(--color-surface-warm)] text-sm font-bold text-[var(--color-accent-text)] after:absolute after:-inset-0.5 after:content-['']"
            >
              {initials}
            </Link>
          </div>
        </header>

        <main
          className={`flex-1 min-w-0 px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 md:pb-10 transition-[padding-top] duration-200 ${
            timerPopupActive ? 'pt-36 sm:pt-32' : 'py-5 lg:py-6'
          }`}
        >
          <div className="mx-auto max-w-[1360px]">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Floating Middle-Left Radial Sidebar Trigger Button (when navStyle === 'radial') */}
      {navStyle !== 'sidebar' && (
        <button
          ref={menuBtnRef}
          type="button"
          onClick={() => setMobileNavOpen((v) => !v)}
          aria-expanded={mobileNavOpen}
          aria-label="Open navigation menu"
          title="Open Radial Sidebar"
          className={`fixed left-2 sm:left-4 top-1/2 z-40 -translate-y-1/2 inline-flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] shadow-lg transition-all duration-200 active:scale-95 hover:border-[var(--color-primary)] hover:scale-105 ${
            mobileNavOpen ? 'scale-75 opacity-0 pointer-events-none' : 'scale-100 opacity-100'
          }`}
        >
          <Menu className="h-5 w-5" strokeWidth={1.85} aria-hidden="true" />
        </button>
      )}

      <MobileBottomDock />
      <MobileNavSheet open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} returnFocusRef={menuBtnRef} />
      <QuickAddTaskModal />
      <TaskDetailDrawer />
    </div>
  );
}
