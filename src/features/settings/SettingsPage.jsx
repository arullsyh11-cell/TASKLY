import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Contrast,
  Download,
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
import { downloadTextFile } from '../../utils/downloadUtils.js';
import { formatDurationHuman, getTodayIso } from '../../utils/dateUtils.js';
import { playFocusChime, requestFocusNotificationPermission } from '../../utils/focusAudio.js';

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const syncDurations = useTimerStore((s) => s.syncDurationsFromSettings);
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('appearance');

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
      toast.success('Pengaturan workspace disimpan.');
    },
    onError: (err) => toast.error(err.message),
  });

  const updateProfileMutation = useMutation({
    mutationFn: () => repo.auth.updateProfile(fullName.trim()),
    onSuccess: (res) => {
      setUser(res.user);
      toast.success('Profil diperbarui.');
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
      toast.success('Akun dan seluruh data dihapus.');
    },
    onError: (err) => toast.error(err.message),
  });

  const createColMutation = useMutation({
    mutationFn: () => repo.columns.create({ name: newColName.trim(), semantic_type: newColSem }),
    onSuccess: () => {
      setNewColName('');
      queryClient.invalidateQueries({ queryKey: ['columns'] });
      toast.success('Kolom ditambahkan.');
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
      toast.success('Kategori ditambahkan.');
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
      toast.success('Label ditambahkan.');
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
      toast.success('Ekspor JSON berhasil diunduh.');
    } catch (err) {
      toast.error(err.message || 'Gagal mengekspor data.');
    }
  }

  async function handleExportCsv() {
    try {
      const csv = await repo.settings.exportCsv();
      downloadTextFile(`taskly-tasks-${getTodayIso()}.csv`, csv, 'text/csv;charset=utf-8');
      toast.success('Ekspor CSV berhasil diunduh.');
    } catch (err) {
      toast.error(err.message || 'Gagal mengekspor CSV.');
    }
  }

  if (isLoading) return <LoadingState label="Memuat pengaturan workspace..." rows={4} />;
  if (isError) return <ErrorState title="Gagal memuat Settings" message={error?.message} onRetry={refetch} />;

  const TABS = [
    { id: 'appearance', label: 'Tampilan & Tema' },
    { id: 'focus', label: 'Focus Timer' },
    { id: 'workflow', label: 'Kolom & Taksonomi' },
    { id: 'account', label: isLocalMode ? 'Profil Workspace' : 'Akun & Keamanan' },
    { id: 'data', label: 'Data & Ekspor' },
  ];

  const initials = (user?.full_name || 'P').trim().charAt(0).toUpperCase();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">Settings</h1>
        <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
          Sesuaikan tema visual, durasi Focus Mode, kolom Kanban, taksonomi, dan cadangan data Anda.
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
                {user?.full_name || 'Pengguna'}
              </h2>
              <p className="text-xs text-[var(--color-text-secondary)]">
                {isLocalMode ? 'Penyimpanan Lokal (Browser localStorage)' : user?.email}
              </p>
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={() => setTab('account')} className="rounded-full self-start sm:self-auto">
            <User className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            <span>Ubah Nama</span>
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-center">
            <p className="text-[11px] text-[var(--color-text-muted)]">Total Tugas</p>
            <p className="mt-0.5 font-mono-num text-base font-bold text-[var(--color-text-primary)]">
              {dashSummary?.counts?.total ?? 0}
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-center">
            <p className="text-[11px] text-[var(--color-text-muted)]">Kolom Board</p>
            <p className="mt-0.5 font-mono-num text-base font-bold text-[var(--color-text-primary)]">
              {columns.length}
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-center">
            <p className="text-[11px] text-[var(--color-text-muted)]">Total Fokus</p>
            <p className="mt-0.5 font-mono-num text-base font-bold text-[var(--color-accent-text)]">
              {formatDurationHuman(focusStats?.total_focus_sec ?? 0)}
            </p>
          </div>
        </div>
      </section>

      {/* Segmented Navigation Tabs - Outlined grid on mobile, outlined inline pill strip on desktop */}
      <div
        role="tablist"
        aria-label="Kategori pengaturan"
        className="grid w-full grid-cols-2 gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 sm:inline-flex sm:w-auto sm:flex-nowrap sm:items-center sm:gap-1.5 sm:rounded-full sm:p-1.5"
      >
        {TABS.map((t, index) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-[40px] whitespace-nowrap rounded-[var(--radius-md)] border px-3.5 text-center text-xs font-semibold transition-colors sm:rounded-full ${
              index === TABS.length - 1 ? 'col-span-2 sm:col-span-1' : ''
            } ${
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
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Pilihan Tema Workspace</h2>
            <p className="text-xs text-[var(--color-text-secondary)]">
              Tema 1 (Light Workspace) sebagai tema default dan Tema 2 (Monochrome) sebagai alternatif kontras netral.
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
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">Tema 1: Light Workspace</p>
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
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">Tema 2: Monochrome</p>
                    <p className="text-[11px] text-[var(--color-text-secondary)]">Kontras Netral</p>
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

          <div className="max-w-xs pt-2">
            <Dropdown
              label="Tampilan Default Kalender"
              value={calView}
              onChange={(val) => {
                setCalView(val);
                updateSettingsMutation.mutate({ default_calendar_view: val });
              }}
              options={[
                { value: 'month', label: 'Bulanan (Monthly)' },
                { value: 'week', label: 'Mingguan (Weekly)' },
                { value: 'day', label: 'Harian (Daily)' },
              ]}
            />
          </div>
        </section>
      )}

      {tab === 'focus' && (
        <section className="max-w-xl rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Preset Durasi Pomodoro</h2>
          <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
            Nilai default standar adalah 25 menit fokus, 5 menit istirahat pendek, dan 15 menit istirahat panjang.
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
                label="Focus (Menit)"
                type="number"
                min={1}
                max={180}
                value={focusMin}
                onChange={(e) => setFocusMin(e.target.value)}
              />
              <Input
                label="Short Break (Menit)"
                type="number"
                min={1}
                max={60}
                value={shortBreakMin}
                onChange={(e) => setShortBreakMin(e.target.value)}
              />
              <Input
                label="Long Break (Menit)"
                type="number"
                min={1}
                max={90}
                value={longBreakMin}
                onChange={(e) => setLongBreakMin(e.target.value)}
              />
            </div>

            {/* Settings row matching Screen 3 "Sound" toggle */}
            <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]">
                  <Volume2 className="h-4 w-4 text-[var(--color-accent-text)]" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">Notifikasi Suara &amp; Nada Dering</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">Bunyikan nada dering &amp; kirim notifikasi saat timer habis.</p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={soundEnabled}
                aria-label="Aktifkan suara notifikasi timer"
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
                Simpan Pengaturan Focus
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  playFocusChime();
                  await requestFocusNotificationPermission();
                  toast.success('Pratinjau nada dering diputar.');
                }}
              >
                <Volume2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <span>Tes Nada Dering</span>
              </Button>
            </div>
          </form>
        </section>
      )}

      {tab === 'workflow' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Urutan Kolom Kanban</h2>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Atur urutan atau tambah kolom kustom untuk alur kerja Anda.
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
                    <p className="text-[11px] text-[var(--color-text-muted)]">Semantik: {col.semantic_type}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveColumn(idx, -1)}
                      aria-label={`Geser naik ${col.name}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === columns.length - 1}
                      onClick={() => moveColumn(idx, 1)}
                      aria-label={`Geser turun ${col.name}`}
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
                aria-label="Nama kolom baru"
                placeholder="Kolom baru..."
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                className="min-h-[38px] flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-text-primary)]"
              />
              <div className="w-36">
                <Dropdown
                  compact
                  aria-label="Semantik kolom baru"
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
                <span>Tambah</span>
              </Button>
            </form>
          </section>

          <div className="space-y-6">
            <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3">
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Kategori Tugas</h2>
              <div className="flex flex-wrap gap-2">
                {categories.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-muted)]">Belum ada kategori.</p>
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
                        aria-label={`Hapus kategori ${cat.name}`}
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
                  aria-label="Nama kategori baru"
                  placeholder="Tambah kategori (mis. Engineering)..."
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="min-h-[38px] flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-text-primary)]"
                />
                <Button type="submit" size="sm" isLoading={createCatMutation.isPending}>
                  Tambah
                </Button>
              </form>
            </section>

            <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3">
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Label Tugas</h2>
              <div className="flex flex-wrap gap-2">
                {labels.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-muted)]">Belum ada label.</p>
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
                        aria-label={`Hapus label ${lb.name}`}
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
                  aria-label="Nama label baru"
                  placeholder="Tambah label (mis. Bug, UX)..."
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  className="min-h-[38px] flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-text-primary)]"
                />
                <Button type="submit" size="sm" isLoading={createLabelMutation.isPending}>
                  Tambah
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
              {isLocalMode ? 'Profil Workspace Lokal' : 'Profil Pengguna'}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateProfileMutation.mutate();
              }}
              className="space-y-4"
            >
              {!isLocalMode && <Input label="Email Terdaftar" value={user?.email || ''} disabled />}
              <Input
                label="Nama Tampilan"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                hint={isLocalMode ? 'Ditampilkan pada sapaan Dashboard. Data tersimpan di localStorage browser.' : undefined}
                required
              />
              <Button type="submit" isLoading={updateProfileMutation.isPending} className="rounded-full px-6">
                Simpan Profil
              </Button>
            </form>
          </section>

          {!isLocalMode && (
            <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Keamanan Kata Sandi</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  changePwMutation.mutate();
                }}
                className="space-y-4"
              >
                <Input
                  label="Kata Sandi Saat Ini"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
                <Input
                  label="Kata Sandi Baru"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                <Button type="submit" variant="secondary" isLoading={changePwMutation.isPending}>
                  Ganti Kata Sandi
                </Button>
              </form>

              <div className="border-t border-[var(--color-border)] pt-4">
                <Button variant="danger" size="sm" onClick={() => setDeleteAccountOpen(true)}>
                  Hapus Akun Permanen
                </Button>
              </div>
            </section>
          )}
        </div>
      )}

      {tab === 'data' && (
        <section className="max-w-xl rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Portabilitas &amp; Ekspor Data</h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
              Unduh salinan penuh tugas, sprint, dan riwayat sesi fokus milik Anda kapan saja.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleExportJson} className="rounded-full px-5">
              <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>Ekspor Workspace (JSON)</span>
            </Button>
            <Button variant="secondary" onClick={handleExportCsv} className="rounded-full px-5">
              <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>Ekspor Daftar Tugas (CSV)</span>
            </Button>
          </div>

          {isLocalMode && (
            <div className="border-t border-[var(--color-border)] pt-4 space-y-2">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Reset Workspace Lokal</h3>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Menghapus seluruh data tugas, sprint, kolom kustom, dan sesi fokus di localStorage browser Anda.
              </p>
              <Button variant="danger" size="sm" onClick={() => setResetWorkspaceOpen(true)}>
                Reset Data LocalStorage
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
            toast.error('Ketik RESET dengan huruf kapital untuk konfirmasi.');
            return;
          }
          await repo.settings.resetWorkspace();
          queryClient.invalidateQueries();
          setResetWorkspaceOpen(false);
          setResetConfirmText('');
          toast.success('Data localStorage workspace berhasil direset.');
        }}
        title="Reset Seluruh Data LocalStorage?"
        description="Seluruh tugas, sprint, kategori, dan riwayat fokus akan dihapus dari browser dan dikembalikan ke kondisi awal."
        confirmLabel="Reset Sekarang"
      >
        <Input
          label='Ketik "RESET" untuk melanjutkan'
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
          if (deleteConfirmText !== 'HAPUS') {
            toast.error('Ketik HAPUS dengan huruf kapital untuk konfirmasi.');
            return;
          }
          deleteAccountMutation.mutate();
        }}
        isLoading={deleteAccountMutation.isPending}
        title="Hapus Akun Secara Permanen?"
        description="Seluruh tugas, sprint, kolom, dan catatan sesi fokus Anda akan dihapus dan tidak dapat dipulihkan."
        confirmLabel="Hapus Akun Sekarang"
      >
        <Input
          label='Ketik "HAPUS" untuk melanjutkan'
          value={deleteConfirmText}
          onChange={(e) => setDeleteConfirmText(e.target.value)}
          placeholder="HAPUS"
        />
      </ConfirmationDialog>
    </div>
  );
}
