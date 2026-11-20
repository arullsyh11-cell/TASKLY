import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Compass,
  Contrast,
  Download,
  PanelLeft,
  Plus,
  Sun,
  Trash2,
  User,
  Volume2,
} from 'lucide-react';
import { toast } from 'sonner';
import { repo } from '../../services/repositories/index.js';
import { useAuthStore } from '../../stores/useAuthStore.js';
import { useUiStore } from '../../stores/useUiStore.js';
import { useTimerStore } from '../../stores/useTimerStore.js';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Dropdown } from '../../components/ui/Dropdown.jsx';
import { ErrorState, LoadingState } from '../../components/ui/States.jsx';
import { ConfirmationDialog } from '../../components/feedback/ConfirmationDialog.jsx';
import { WorkspaceVaultPanel } from './WorkspaceVaultPanel.jsx';
import { downloadTextFile } from '../../utils/downloadUtils.js';
import { addDaysIso, formatDateId, formatDurationHuman, getTodayIso } from '../../utils/dateUtils.js';
import {
  playFocusChime,
  playReminderChime,
  requestFocusNotificationPermission,
  sendReminderNotification,
} from '../../utils/focusAudio.js';
import { REMINDER_PRESET_NUMBERS, clampReminderDays } from '../../utils/reminderUtils.js';

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const navStyle = useUiStore((s) => s.navStyle);
  const setNavStyle = useUiStore((s) => s.setNavStyle);
  const syncDurations = useTimerStore((s) => s.syncDurationsFromSettings);
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const [tab, setTab] = useState(() => searchParams.get('tab') || 'appearance');

  useEffect(() => {
    const qTab = searchParams.get('tab');
    if (qTab && ['appearance', 'focus', 'vault', 'workflow', 'account', 'data'].includes(qTab)) {
      setTab(qTab);
    }
  }, [searchParams]);

  // Account / Profile Form
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetWorkspaceOpen, setResetWorkspaceOpen] = useState(false);
  const isLocalMode = repo.mode === 'local';

  // Settings Form
  const [focusMin, setFocusMin] = useState(25);
  const [shortBreakMin, setShortBreakMin] = useState(5);
  const [longBreakMin, setLongBreakMin] = useState(15);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [defaultReminderDays, setDefaultReminderDays] = useState(1);
  const [customDefaultMode, setCustomDefaultMode] = useState(false);
  const [calView, setCalView] = useState('month');

  // Workflow & Taxonomy Forms
  const [newColName, setNewColName] = useState('');
  const [newColSem, setNewColSem] = useState('in_progress');
  const [newCatName, setNewCatName] = useState('');
  const [newLabelName, setNewLabelName] = useState('');

  const { data: settings, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: () => repo.settings.get(),
  });

  const { data: dashSummary } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => repo.dashboard.getSummary(),
  });

  const { data: focusStats } = useQuery({
    queryKey: ['focus', 'stats'],
    queryFn: () => repo.focus.getStats(),
  });

  const { data: columns = [] } = useQuery({
    queryKey: ['columns'],
    queryFn: () => repo.columns.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => repo.taxonomy.listCategories(),
  });

  const { data: labels = [] } = useQuery({
    queryKey: ['labels'],
    queryFn: () => repo.taxonomy.listLabels(),
  });

  useEffect(() => {
    if (settings) {
      setFocusMin(settings.pomodoro_focus_min || 25);
      setShortBreakMin(settings.pomodoro_short_break_min || 5);
      setLongBreakMin(settings.pomodoro_long_break_min || 15);
      setSoundEnabled(Boolean(settings.sound_enabled));
      setReminderEnabled(settings.reminder_enabled !== false);
      const dDays = settings.default_reminder_days ?? 1;
      setDefaultReminderDays(dDays);
      setCustomDefaultMode(!REMINDER_PRESET_NUMBERS.has(Number(dDays)));
      setCalView(settings.default_calendar_view || 'month');
    }
  }, [settings]);

  useEffect(() => {
    if (user?.full_name) setFullName(user.full_name);
  }, [user]);

  const updateSettingsMutation = useMutation({
    mutationFn: (payload) => repo.settings.update(payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated);
      if (updated.theme) setTheme(updated.theme);
      syncDurations(updated);
      toast.success('Workspace settings saved.');
    },
    onError: (err) => toast.error(err.message),
  });

  const updateProfileMutation = useMutation({
    mutationFn: () => repo.auth.updateProfile(fullName.trim()),
    onSuccess: (res) => {
      setUser(res.user);
      toast.success('Profile updated.');
    },
    onError: (err) => toast.error(err.message),
  });

  const changePwMutation = useMutation({
    mutationFn: () => repo.auth.changePassword({ currentPassword, newPassword }),
    onSuccess: (res) => {
      setCurrentPassword('');
      setNewPassword('');
      toast.success(res.message);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () => repo.auth.deleteAccount(),
    onSuccess: async () => {
      queryClient.clear();
      await logout();
      toast.success('Account and all workspace data deleted.');
    },
    onError: (err) => toast.error(err.message),
  });

  const createColMutation = useMutation({
    mutationFn: () => repo.columns.create({ name: newColName.trim(), semantic_type: newColSem }),
    onSuccess: () => {
      setNewColName('');
      queryClient.invalidateQueries({ queryKey: ['columns'] });
      toast.success('Column added.');
    },
    onError: (err) => toast.error(err.message),
  });

  const reorderColMutation = useMutation({
    mutationFn: (ids) => repo.columns.reorder(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['columns'] });
    },
  });

  const createCatMutation = useMutation({
    mutationFn: () => repo.taxonomy.createCategory({ name: newCatName.trim(), color_token: 'accent' }),
    onSuccess: () => {
      setNewCatName('');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Category added.');
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteCatMutation = useMutation({
    mutationFn: (id) => repo.taxonomy.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const createLabelMutation = useMutation({
    mutationFn: () => repo.taxonomy.createLabel({ name: newLabelName.trim(), color_token: 'secondary' }),
    onSuccess: () => {
      setNewLabelName('');
      queryClient.invalidateQueries({ queryKey: ['labels'] });
      toast.success('Label added.');
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteLabelMutation = useMutation({
    mutationFn: (id) => repo.taxonomy.deleteLabel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  function moveColumn(index, dir) {
    const nextIdx = index + dir;
    if (nextIdx < 0 || nextIdx >= columns.length) return;
    const ids = columns.map((c) => c.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(nextIdx, 0, moved);
    reorderColMutation.mutate(ids);
  }

  async function handleExportJson() {
    try {
      const payload = await repo.settings.exportJson();
      downloadTextFile(
        `taskly-export-${getTodayIso()}.json`,
        JSON.stringify(payload, null, 2),
        'application/json'
      );
      toast.success('JSON export downloaded.');
    } catch (err) {
      toast.error(err.message || 'Failed to export data.');
    }
  }

  async function handleExportCsv() {
    try {
      const csv = await repo.settings.exportCsv();
      downloadTextFile(`taskly-tasks-${getTodayIso()}.csv`, csv, 'text/csv;charset=utf-8');
      toast.success('CSV export downloaded.');
    } catch (err) {
      toast.error(err.message || 'Failed to export CSV.');
    }
  }

  if (isLoading) return <LoadingState label="Loading workspace settings..." rows={4} />;
  if (isError) return <ErrorState title="Failed to load Settings" message={error?.message} onRetry={refetch} />;

  const TABS = [
    { id: 'appearance', label: 'Appearance' },
    { id: 'focus', label: 'Focus & Reminders' },
    { id: 'vault', label: 'Files & Notes' },
    { id: 'workflow', label: 'Board & Tags' },
    { id: 'account', label: isLocalMode ? 'Profile' : 'Account & Security' },
    { id: 'data', label: 'Data & Export' },
  ];

  const initials = (user?.full_name || 'U').trim().charAt(0).toUpperCase();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">Settings</h1>
        <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
          Customize themes, Focus Mode &amp; reminders, personal files and notes, Kanban workflow, and backups.
        </p>
      </header>

      {/* Profile Header Card with Liquid Glass & 3 Real Inset Stat Tiles */}
      <section className="liquid-glass rounded-[var(--radius-lg)] border p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <div className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[var(--color-border-warm)] bg-[var(--color-surface-warm)] text-lg font-bold text-[var(--color-accent-text)]">
              {initials}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                {user?.full_name || 'User'}
              </h2>
              <p className="text-xs text-[var(--color-text-secondary)]">
                {isLocalMode ? 'Local Storage (Browser localStorage)' : user?.email}
              </p>
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={() => setTab('account')} className="rounded-full self-start sm:self-auto">
            <User className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            <span>Edit Name</span>
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-center">
            <p className="text-[11px] text-[var(--color-text-muted)]">Total Tasks</p>
            <p className="mt-0.5 font-mono-num text-base font-bold text-[var(--color-text-primary)]">
              {dashSummary?.counts?.total ?? 0}
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-center">
            <p className="text-[11px] text-[var(--color-text-muted)]">Board Columns</p>
            <p className="mt-0.5 font-mono-num text-base font-bold text-[var(--color-text-primary)]">
              {columns.length}
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-center">
            <p className="text-[11px] text-[var(--color-text-muted)]">Total Focus</p>
            <p className="mt-0.5 font-mono-num text-base font-bold text-[var(--color-accent-text)]">
              {formatDurationHuman(focusStats?.total_focus_sec ?? 0)}
            </p>
          </div>
        </div>
      </section>

      {/* Balanced 6-Tab Pill Switcher (2x3 on mobile, 3x2 on tablet, single pill strip on desktop) */}
      <div
        role="tablist"
        aria-label="Settings categories"
        className="grid w-full grid-cols-2 gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 sm:grid-cols-3 lg:inline-flex lg:w-auto lg:flex-nowrap lg:items-center lg:gap-1.5 lg:rounded-full lg:p-1.5"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-[44px] lg:min-h-[40px] whitespace-nowrap rounded-full border px-3.5 text-center text-xs font-semibold transition-colors ${
              tab === t.id
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-xs'
                : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'appearance' && (
        <section className="max-w-2xl space-y-5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Workspace Theme</h2>
            <p className="text-xs text-[var(--color-text-secondary)]">
              Theme 1 (Light Workspace) is the default theme and Theme 2 (Monochrome) offers neutral dark contrast.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setTheme('light');
                updateSettingsMutation.mutate({ theme: 'light' });
              }}
              aria-pressed={theme === 'light'}
              className={`flex flex-col gap-3 rounded-[var(--radius-md)] border p-4 text-left transition-colors ${
                theme === 'light'
                  ? 'border-[var(--color-primary)] bg-[var(--color-surface-warm)]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-border-strong)]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <Sun className="h-5 w-5 text-[var(--color-accent-text)]" strokeWidth={1.75} aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">Theme 1: Light Workspace</p>
                    <p className="text-[11px] text-[var(--color-text-secondary)]">Default Workspace</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5" aria-hidden="true">
                {['#FFFFFF', '#F5F3F0', '#D5C4AE', '#6B4A2E', '#4A4A46', '#1A120E'].map((hx) => (
                  <span
                    key={hx}
                    className="h-4 w-4 rounded-full border border-[var(--color-border-strong)]"
                    style={{ backgroundColor: hx }}
                  />
                ))}
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setTheme('monochrome');
                updateSettingsMutation.mutate({ theme: 'monochrome' });
              }}
              aria-pressed={theme === 'monochrome'}
              className={`flex flex-col gap-3 rounded-[var(--radius-md)] border p-4 text-left transition-colors ${
                theme === 'monochrome'
                  ? 'border-[var(--color-primary)] bg-[var(--color-surface-warm)]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-border-strong)]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <Contrast className="h-5 w-5 text-[var(--color-accent-text)]" strokeWidth={1.75} aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">Theme 2: Monochrome</p>
                    <p className="text-[11px] text-[var(--color-text-secondary)]">Neutral Contrast</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5" aria-hidden="true">
                {['#0B0B0B', '#1A1A1A', '#333333', '#6B6B6B', '#D9D9D9', '#FFFFFF'].map((hx) => (
                  <span
                    key={hx}
                    className="h-4 w-4 rounded-full border border-[var(--color-border-strong)]"
                    style={{ backgroundColor: hx }}
                  />
                ))}
              </div>
            </button>
          </div>

          <div className="space-y-3 border-t border-[var(--color-border)] pt-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Sidebar Navigation Style (Web &amp; Mobile)
              </h3>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Switch between the circular Radial Sidebar and the classic sliding sidebar on desktop and mobile.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setNavStyle('radial');
                  updateSettingsMutation.mutate({ nav_style: 'radial' });
                }}
                aria-pressed={navStyle === 'radial'}
                className={`flex flex-col gap-2 rounded-[var(--radius-md)] border p-4 text-left transition-colors ${
                  navStyle === 'radial'
                    ? 'border-[var(--color-primary)] bg-[var(--color-surface-warm)]'
                    : 'border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-border-strong)]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Compass className="h-5 w-5 shrink-0 text-[var(--color-accent-text)]" strokeWidth={1.75} aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">Version 1: Radial Sidebar</p>
                    <p className="text-[11px] text-[var(--color-text-secondary)]">
                      Compact half-circle on mobile &amp; left-docked wheel on web
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setNavStyle('sidebar');
                  updateSettingsMutation.mutate({ nav_style: 'sidebar' });
                }}
                aria-pressed={navStyle === 'sidebar'}
                className={`flex flex-col gap-2 rounded-[var(--radius-md)] border p-4 text-left transition-colors ${
                  navStyle === 'sidebar'
                    ? 'border-[var(--color-primary)] bg-[var(--color-surface-warm)]'
                    : 'border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-border-strong)]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <PanelLeft className="h-5 w-5 shrink-0 text-[var(--color-accent-text)]" strokeWidth={1.75} aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">Version 2: Slide Sidebar</p>
                    <p className="text-[11px] text-[var(--color-text-secondary)]">
                      Collapsible rail on web &amp; slide drawer on mobile
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div className="max-w-xs pt-2">
            <Dropdown
              label="Default Calendar View"
              value={calView}
              onChange={(val) => {
                setCalView(val);
                updateSettingsMutation.mutate({ default_calendar_view: val });
              }}
              options={[
                { value: 'month', label: 'Monthly' },
                { value: 'week', label: 'Weekly' },
                { value: 'day', label: 'Daily' },
              ]}
            />
          </div>
        </section>
      )}

      {tab === 'vault' && <WorkspaceVaultPanel />}

      {tab === 'focus' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Pomodoro Duration Presets</h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
              Standard defaults are 25 minutes focus, 5 minutes short break, and 15 minutes long break.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateSettingsMutation.mutate({
                  pomodoro_focus_min: Number(focusMin),
                  pomodoro_short_break_min: Number(shortBreakMin),
                  pomodoro_long_break_min: Number(longBreakMin),
                  sound_enabled: soundEnabled,
                });
              }}
              className="mt-4 space-y-4"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Input
                  label="Focus (Min)"
                  type="number"
                  min={1}
                  max={180}
                  value={focusMin}
                  onChange={(e) => setFocusMin(e.target.value)}
                />
                <Input
                  label="Short Break (Min)"
                  type="number"
                  min={1}
                  max={60}
                  value={shortBreakMin}
                  onChange={(e) => setShortBreakMin(e.target.value)}
                />
                <Input
                  label="Long Break (Min)"
                  type="number"
                  min={1}
                  max={90}
                  value={longBreakMin}
                  onChange={(e) => setLongBreakMin(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]">
                    <Volume2 className="h-4 w-4 text-[var(--color-accent-text)]" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">Sound Alerts &amp; Ringtone</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">Play a chime and send notifications when the timer ends or a reminder triggers.</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={soundEnabled}
                  aria-label="Enable timer notification sound"
                  onClick={() => setSoundEnabled((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors ${
                    soundEnabled
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]'
                      : 'border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)]'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-[var(--color-bg)] shadow-xs transition-transform ${
                      soundEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" isLoading={updateSettingsMutation.isPending} className="rounded-full px-6">
                  Save Focus Settings
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    playFocusChime();
                    await requestFocusNotificationPermission();
                    toast.success('Ringtone preview played.');
                  }}
                >
                  <Volume2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  <span>Test Ringtone</span>
                </Button>
              </div>
            </form>
          </section>

          <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Deadline Reminders</h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
              Set automatic alerts before a task due date (default 1 day before deadline, or custom days).
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateSettingsMutation.mutate({
                  reminder_enabled: reminderEnabled,
                  default_reminder_days: clampReminderDays(defaultReminderDays, 1),
                });
              }}
              className="mt-4 space-y-4"
            >
              <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]">
                    <Bell className="h-4 w-4 text-[var(--color-accent-text)]" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">Enable Automatic Reminders</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      Send reminder notifications for tasks entering their reminder window.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={reminderEnabled}
                  aria-label="Enable automatic deadline reminders"
                  onClick={() => setReminderEnabled((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors ${
                    reminderEnabled
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]'
                      : 'border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)]'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-[var(--color-bg)] shadow-xs transition-transform ${
                      reminderEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
                <Dropdown
                  label="Default Reminder Lead Time"
                  value={customDefaultMode ? 'custom' : String(defaultReminderDays)}
                  onChange={(val) => {
                    if (val === 'custom') {
                      setCustomDefaultMode(true);
                    } else {
                      setCustomDefaultMode(false);
                      setDefaultReminderDays(Number(val));
                    }
                  }}
                  options={[
                    { value: '1', label: '1 day before (Default)' },
                    { value: '0', label: 'On due date (Day of)' },
                    { value: '2', label: '2 days before deadline' },
                    { value: '3', label: '3 days before deadline' },
                    { value: '7', label: '7 days before deadline' },
                    { value: 'custom', label: 'Custom days...' },
                  ]}
                />

                {customDefaultMode && (
                  <Input
                    label="Custom Days Before Deadline"
                    type="number"
                    min={0}
                    max={60}
                    value={defaultReminderDays}
                    onChange={(e) => setDefaultReminderDays(clampReminderDays(e.target.value, 1))}
                  />
                )}
              </div>

              <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-2.5 text-xs text-[var(--color-text-secondary)]">
                <p className="font-semibold text-[var(--color-text-primary)]">Sample Notification Message:</p>
                <p className="mt-0.5">
                  &ldquo;Don&apos;t forget, you have a task due on{' '}
                  {formatDateId(addDaysIso(getTodayIso(), Math.max(0, Number(defaultReminderDays || 1))), 'MMMM d, yyyy')}
                  .&rdquo;
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" isLoading={updateSettingsMutation.isPending} className="rounded-full px-6">
                  Save Reminder Settings
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    const targetDate = formatDateId(
                      addDaysIso(getTodayIso(), Math.max(0, Number(defaultReminderDays || 1))),
                      'MMMM d, yyyy'
                    );
                    const sampleBody = `Don't forget, you have a task due on ${targetDate}.`;
                    if (soundEnabled) playReminderChime();
                    await requestFocusNotificationPermission();
                    sendReminderNotification('Sample Deadline Reminder', sampleBody, 'taskly-rem-test');
                    toast.warning('Sample Deadline Reminder', {
                      description: sampleBody,
                      duration: 6000,
                    });
                  }}
                >
                  <Bell className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  <span>Test Reminder Alert</span>
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}

      {tab === 'workflow' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Kanban Column Order</h2>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Reorder or add custom columns for your workflow.
              </p>
            </div>

            <ul className="space-y-2">
              {columns.map((col, idx) => (
                <li
                  key={col.id}
                  className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">{col.name}</p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">Semantic: {col.semantic_type}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveColumn(idx, -1)}
                      aria-label={`Move ${col.name} up`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === columns.length - 1}
                      onClick={() => moveColumn(idx, 1)}
                      aria-label={`Move ${col.name} down`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newColName.trim()) createColMutation.mutate();
              }}
              className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-3"
            >
              <input
                type="text"
                aria-label="New column name"
                placeholder="New column..."
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                className="min-h-[38px] flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-text-primary)]"
              />
              <div className="w-36">
                <Dropdown
                  compact
                  aria-label="New column semantic type"
                  value={newColSem}
                  onChange={setNewColSem}
                  options={[
                    { value: 'backlog', label: 'backlog' },
                    { value: 'todo', label: 'todo' },
                    { value: 'in_progress', label: 'in_progress' },
                    { value: 'review', label: 'review' },
                    { value: 'done', label: 'done' },
                  ]}
                />
              </div>
              <Button type="submit" size="sm" isLoading={createColMutation.isPending}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                <span>Add</span>
              </Button>
            </form>
          </section>

          <div className="space-y-6">
            <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3">
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Task Categories</h2>
              <div className="flex flex-wrap gap-2">
                {categories.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-muted)]">No categories yet.</p>
                ) : (
                  categories.map((cat) => (
                    <span
                      key={cat.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-xs text-[var(--color-text-primary)]"
                    >
                      <span>{cat.name}</span>
                      <button
                        type="button"
                        onClick={() => deleteCatMutation.mutate(cat.id)}
                        aria-label={`Delete category ${cat.name}`}
                        className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                      >
                        <Trash2 className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    </span>
                  ))
                )}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newCatName.trim()) createCatMutation.mutate();
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  aria-label="New category name"
                  placeholder="Add category (e.g. Engineering)..."
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="min-h-[38px] flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-text-primary)]"
                />
                <Button type="submit" size="sm" isLoading={createCatMutation.isPending}>
                  Add
                </Button>
              </form>
            </section>

            <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3">
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Task Labels</h2>
              <div className="flex flex-wrap gap-2">
                {labels.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-muted)]">No labels yet.</p>
                ) : (
                  labels.map((lb) => (
                    <span
                      key={lb.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-xs text-[var(--color-text-primary)]"
                    >
                      <span>{lb.name}</span>
                      <button
                        type="button"
                        onClick={() => deleteLabelMutation.mutate(lb.id)}
                        aria-label={`Delete label ${lb.name}`}
                        className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                      >
                        <Trash2 className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    </span>
                  ))
                )}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newLabelName.trim()) createLabelMutation.mutate();
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  aria-label="New label name"
                  placeholder="Add label (e.g. Bug, UX)..."
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  className="min-h-[38px] flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-text-primary)]"
                />
                <Button type="submit" size="sm" isLoading={createLabelMutation.isPending}>
                  Add
                </Button>
              </form>
            </section>
          </div>
        </div>
      )}

      {tab === 'account' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              {isLocalMode ? 'Local Workspace Profile' : 'User Profile'}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateProfileMutation.mutate();
              }}
              className="space-y-4"
            >
              {!isLocalMode && <Input label="Registered Email" value={user?.email || ''} disabled />}
              <Input
                label="Display Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                hint={isLocalMode ? 'Shown in the Dashboard greeting. Saved in browser localStorage.' : undefined}
                required
              />
              <Button type="submit" isLoading={updateProfileMutation.isPending} className="rounded-full px-6">
                Save Profile
              </Button>
            </form>
          </section>

          {!isLocalMode && (
            <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Password Security</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  changePwMutation.mutate();
                }}
                className="space-y-4"
              >
                <Input
                  label="Current Password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
                <Input
                  label="New Password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                <Button type="submit" variant="secondary" isLoading={changePwMutation.isPending}>
                  Change Password
                </Button>
              </form>

              <div className="border-t border-[var(--color-border)] pt-4">
                <Button variant="danger" size="sm" onClick={() => setDeleteAccountOpen(true)}>
                  Delete Account Permanently
                </Button>
              </div>
            </section>
          )}
        </div>
      )}

      {tab === 'data' && (
        <section className="max-w-xl rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Data Portability &amp; Export</h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
              Download a full backup of your tasks, sprints, focus sessions, files, and quick notes anytime.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleExportJson} className="rounded-full px-5">
              <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>Export Workspace (JSON)</span>
            </Button>
            <Button variant="secondary" onClick={handleExportCsv} className="rounded-full px-5">
              <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>Export Task List (CSV)</span>
            </Button>
          </div>

          {isLocalMode && (
            <div className="border-t border-[var(--color-border)] pt-4 space-y-2">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Reset Local Workspace</h3>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Clears all tasks, sprints, custom columns, focus sessions, files, and quick notes from browser localStorage.
              </p>
              <Button variant="danger" size="sm" onClick={() => setResetWorkspaceOpen(true)}>
                Reset LocalStorage Data
              </Button>
            </div>
          )}
        </section>
      )}

      <ConfirmationDialog
        open={resetWorkspaceOpen}
        onClose={() => {
          setResetWorkspaceOpen(false);
          setResetConfirmText('');
        }}
        onConfirm={async () => {
          if (resetConfirmText !== 'RESET') {
            toast.error('Type RESET in uppercase to confirm.');
            return;
          }
          await repo.settings.resetWorkspace();
          queryClient.invalidateQueries();
          setResetWorkspaceOpen(false);
          setResetConfirmText('');
          toast.success('Local workspace data has been reset.');
        }}
        title="Reset All LocalStorage Data?"
        description="All tasks, sprints, categories, focus history, files, and notes will be removed from this browser and restored to default."
        confirmLabel="Reset Now"
      >
        <Input
          label='Type "RESET" to continue'
          value={resetConfirmText}
          onChange={(e) => setResetConfirmText(e.target.value)}
          placeholder="RESET"
        />
      </ConfirmationDialog>

      <ConfirmationDialog
        open={deleteAccountOpen}
        onClose={() => {
          setDeleteAccountOpen(false);
          setDeleteConfirmText('');
        }}
        onConfirm={() => {
          if (deleteConfirmText !== 'DELETE') {
            toast.error('Type DELETE in uppercase to confirm.');
            return;
          }
          deleteAccountMutation.mutate();
        }}
        isLoading={deleteAccountMutation.isPending}
        title="Delete Account Permanently?"
        description="All your tasks, sprints, columns, and focus session history will be permanently deleted and cannot be recovered."
        confirmLabel="Delete Account Now"
      >
        <Input
          label='Type "DELETE" to continue'
          value={deleteConfirmText}
          onChange={(e) => setDeleteConfirmText(e.target.value)}
          placeholder="DELETE"
        />
      </ConfirmationDialog>
    </div>
  );
}
