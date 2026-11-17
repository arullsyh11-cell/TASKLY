import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FolderPlus,
  Layers,
  ListTodo,
  Play,
  Plus,
  Search,
  Target,
  Timer,
  Zap,
} from 'lucide-react';
import { repo } from '../../services/repositories/index.js';
import { useAuthStore } from '../../stores/useAuthStore.js';
import { useUiStore } from '../../stores/useUiStore.js';
import { useTimerStore } from '../../stores/useTimerStore.js';
import { Button } from '../../components/ui/Button.jsx';
import { ProgressRing } from '../../components/ui/ProgressRing.jsx';
import { OverdueTag, PriorityBadge, StatusBadge } from '../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States.jsx';
import {
  daysRemaining,
  formatDateId,
  formatDurationHuman,
  formatRelativeDateTime,
  getTodayIso,
  isTaskOverdue,
} from '../../utils/dateUtils.js';

function describeActivity(item) {
  const meta = item.metadata || {};
  switch (item.action) {
    case 'task_created':
      return `Membuat tugas "${meta.title || ''}" di ${meta.column_name || 'papan'}`;
    case 'task_completed':
      return `Menyelesaikan tugas "${meta.title || ''}"`;
    case 'task_moved':
      return `Memindahkan "${meta.title || ''}" ke ${meta.to_column || 'kolom baru'}`;
    case 'task_deleted':
      return `Menghapus tugas "${meta.title || ''}"`;
    case 'sprint_created':
      return `Merencanakan sprint "${meta.name || ''}"`;
    case 'sprint_started':
      return `Memulai sprint aktif "${meta.name || ''}"`;
    case 'sprint_completed':
      return `Menyelesaikan sprint "${meta.name || ''}"`;
    case 'focus_logged':
      return `Sesi fokus ${meta.minutes || 0} menit (${meta.task_title || 'Fokus Umum'})`;
    case 'column_created':
      return `Menambah kolom kustom "${meta.name || ''}"`;
    default:
      return item.action;
  }
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const openQuickAdd = useUiStore((s) => s.openQuickAdd);
  const openTaskDrawer = useUiStore((s) => s.openTaskDrawer);
  const selectTimerTask = useTimerStore((s) => s.selectTask);
  const navigate = useNavigate();
  const [mobileQuery, setMobileQuery] = useState('');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => repo.dashboard.getSummary(),
  });

  const { data: mobileResults = [] } = useQuery({
    queryKey: ['tasks', { mobileDashSearch: mobileQuery }],
    queryFn: () => repo.tasks.list({ search: mobileQuery }),
    enabled: mobileQuery.trim().length > 0,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-56 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface)]" />
        <LoadingState label="Memuat ringkasan harian workspace..." rows={4} />
      </div>
    );
  }

  if (isError) {
    return <ErrorState title="Gagal memuat Dashboard" message={error?.message} onRetry={refetch} />;
  }

  const counts = data?.counts || { total: 0, completed: 0, in_progress: 0, overdue: 0 };
  const activeSprint = data?.active_sprint;
  const upcomingDeadlines = data?.upcoming_deadlines || [];
  const daily = data?.daily_overview || { completed_today: 0, focus_sec_today: 0, focus_sessions_today: 0 };
  const activities = data?.recent_activities || [];
  const todayFormatted = formatDateId(getTodayIso(), 'EEEE, d MMMM yyyy');

  const completionPct = counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0;
  const focusGoalSec = 60 * 60; // 60m daily benchmark display ring
  const focusPct = Math.min(100, Math.round((daily.focus_sec_today / focusGoalSec) * 100));
  const overduePct = counts.total > 0 ? Math.round((counts.overdue / counts.total) * 100) : 0;

  const statCards = [
    {
      label: 'Total & Selesai',
      value: `${counts.completed}/${counts.total}`,
      tag: `${completionPct}% tuntas`,
      ringPct: completionPct,
      ringColor: 'var(--color-success)',
      icon: CheckCircle2,
      to: '/tasks?semanticType=done',
    },
    {
      label: 'Berjalan',
      value: String(counts.in_progress),
      tag: 'Aktif / Review',
      ringPct: counts.total > 0 ? Math.round((counts.in_progress / counts.total) * 100) : 0,
      ringColor: 'var(--color-primary)',
      icon: Zap,
      to: '/tasks?semanticType=in_progress',
    },
    {
      label: 'Fokus Hari Ini',
      value: formatDurationHuman(daily.focus_sec_today),
      tag: `${daily.focus_sessions_today} sesi`,
      ringPct: focusPct,
      ringColor: 'var(--color-primary)',
      icon: Clock,
      to: '/focus',
    },
    {
      label: 'Terlambat',
      value: String(counts.overdue),
      tag: counts.overdue > 0 ? 'Perlu aksi' : 'Semua aman',
      ringPct: overduePct,
      ringColor: counts.overdue > 0 ? 'var(--color-danger)' : 'var(--color-border-strong)',
      icon: AlertCircle,
      to: '/tasks?deadline=overdue',
    },
  ];

  const handleLaunchFocus = (task) => {
    selectTimerTask(task.id, task.title);
    navigate('/focus');
  };

  const leadFocusTask = upcomingDeadlines[0] || null;

  return (
    <div className="space-y-6">
      {/* Greeting Block matching reference Screen 1 */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--color-text-primary)]">
            Halo, {user?.full_name?.split(' ')[0] || 'Pengguna'}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Ringkasan alur kerja dan fokus Anda untuk {todayFormatted}.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2.5">
          <Button variant="secondary" onClick={() => navigate('/focus')} className="rounded-full px-5">
            <Timer className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <span>Buka Focus Mode</span>
          </Button>
          <Button onClick={() => openQuickAdd()} className="rounded-full px-5">
            <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <span>Quick Add Task</span>
          </Button>
        </div>
      </header>

      {/* Mobile Search Pill matching Screen 1 */}
      <div className="relative md:hidden">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <input
          type="search"
          aria-label="Cari tugas cepat"
          value={mobileQuery}
          onChange={(e) => setMobileQuery(e.target.value)}
          placeholder="Cari tugas atau label..."
          className="h-11 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] pl-11 pr-4 text-base sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
        />
        {mobileQuery.trim().length > 0 && (
          <div className="mt-2 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] p-2">
            {mobileResults.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[var(--color-text-muted)]">Tidak ditemukan tugas.</p>
            ) : (
              <ul className="space-y-1">
                {mobileResults.slice(0, 5).map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => {
                        openTaskDrawer(t.id);
                        setMobileQuery('');
                      }}
                      className="flex w-full items-center justify-between rounded-[var(--radius-sm)] px-3 py-2 text-left text-xs text-[var(--color-text-primary)]"
                    >
                      <span className="truncate font-medium">{t.title}</span>
                      <span className="text-[var(--color-accent-text)]">{t.column_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Ringkasan Hari Ini (Solid Tactile Stat Cards with Circular Progress Rings) */}
      <section aria-label="Ringkasan statistik hari ini" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
            <Layers className="h-4 w-4 text-[var(--color-accent-text)]" strokeWidth={1.75} aria-hidden="true" />
            <span>Ringkasan Hari Ini</span>
          </h2>
          <Link to="/tasks" className="text-xs font-medium text-[var(--color-accent-text)] hover:underline">
            Lihat semua
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-4">
          {statCards.map((card) => (
            <Link
              key={card.label}
              to={card.to}
              className="surface-texture group flex items-center justify-between gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 sm:p-4 transition-colors hover:border-[var(--color-border-strong)]"
            >
              <div className="min-w-0 space-y-1">
                <p className="truncate text-xs font-medium text-[var(--color-text-secondary)]">{card.label}</p>
                <p className="font-mono-num text-lg sm:text-xl font-bold text-[var(--color-text-primary)]">{card.value}</p>
                <span className="inline-block max-w-full truncate rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 text-[10px] sm:text-[11px] font-medium text-[var(--color-text-secondary)]">
                  {card.tag}
                </span>
              </div>
              <ProgressRing percent={card.ringPct} size={46} stroke={4.5} color={card.ringColor} icon={card.icon} />
            </Link>
          ))}
        </div>
      </section>

      {/* First-Run Honest Empty Workspace State OR Reference Hero + Queues */}
      {counts.total === 0 && !activeSprint ? (
        <EmptyState
          icon={FolderPlus}
          title="Workspace Anda siap digunakan"
          description="Belum ada tugas atau sprint yang tercatat. Buat tugas pertama Anda atau susun sprint berbatas waktu untuk mulai mengatur alur kerja."
          action={
            <Button onClick={() => openQuickAdd()} className="rounded-full px-5">
              <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>Buat Tugas Pertama</span>
            </Button>
          }
          secondaryAction={
            <Button variant="secondary" onClick={() => navigate('/sprints')} className="rounded-full px-5">
              <Zap className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>Rencanakan Sprint</span>
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {/* Featured Highlight Banner matching "Today's workout" card in Screen 1 with subtle texture */}
          <section
            aria-label="Sprint dan fokus utama"
            className="surface-texture rounded-[var(--radius-lg)] border border-[var(--color-border-warm)] bg-[var(--color-surface-elevated)] p-5 sm:p-6"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1 space-y-2">
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-accent-text)]">
                  <Target className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  <span>{activeSprint ? 'Active Sprint' : 'Fokus Prioritas'}</span>
                </p>

                {activeSprint ? (
                  <>
                    <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">{activeSprint.name}</h2>
                    {activeSprint.goal && (
                      <p className="text-sm text-[var(--color-text-secondary)]">{activeSprint.goal}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 font-mono-num text-xs font-medium text-[var(--color-text-primary)]">
                        {activeSprint.completed_tasks}/{activeSprint.total_tasks} Selesai
                      </span>
                      <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
                        {daysRemaining(activeSprint.end_date) >= 0
                          ? `Sisa ${daysRemaining(activeSprint.end_date)} hari`
                          : `Lewat ${Math.abs(daysRemaining(activeSprint.end_date))} hari`}
                      </span>
                      <Link
                        to={`/sprints/${activeSprint.id}`}
                        className="inline-flex items-center rounded-full border border-[var(--color-border-warm)] bg-[var(--color-surface-warm)] px-3 py-1 text-xs font-semibold text-[var(--color-accent-text)] hover:underline"
                      >
                        Detail &amp; Burndown
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                      Belum ada sprint aktif saat ini
                    </h2>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      Aktifkan sprint untuk memantau burndown harian atau langsung mulai sesi fokus pada tugas mendesak.
                    </p>
                  </>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-4">
                {activeSprint && (
                  <ProgressRing
                    percent={activeSprint.progress_percent}
                    size={72}
                    stroke={6}
                    color="var(--color-primary)"
                    centerLabel={`${activeSprint.progress_percent}%`}
                  />
                )}
                {leadFocusTask ? (
                  <button
                    type="button"
                    onClick={() => handleLaunchFocus(leadFocusTask)}
                    aria-label={`Mulai fokus pada ${leadFocusTask.title}`}
                    title={`Mulai Fokus: ${leadFocusTask.title}`}
                    className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-on-primary)] transition-transform hover:scale-105 hover:bg-[var(--color-primary-hover)]"
                  >
                    <Play className="ml-0.5 h-6 w-6 fill-current" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                ) : (
                  <Button variant="secondary" onClick={() => navigate('/sprints')} className="rounded-full">
                    Kelola Sprint
                  </Button>
                )}
              </div>
            </div>
          </section>

          {/* Two-Column Action Queue & Activity Split */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 lg:col-span-7">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h2 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
                    <ListTodo className="h-4 w-4 text-[var(--color-accent-text)]" strokeWidth={1.75} aria-hidden="true" />
                    <span>Antrean Prioritas &amp; Tenggat Terdekat</span>
                  </h2>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Tugas terlambat, jatuh tempo dalam 7 hari, atau prioritas tinggi.
                  </p>
                </div>
                <Link to="/board" className="text-xs font-medium text-[var(--color-accent-text)] hover:underline">
                  Buka Board
                </Link>
              </div>

              {upcomingDeadlines.length === 0 ? (
                <EmptyState
                  icon={CalendarClock}
                  title="Tidak ada tenggat mendesak dalam 7 hari ke depan"
                  description="Semua tugas berprioritas tinggi atau berbatas waktu dekat sudah tertangani."
                  action={
                    <Button size="sm" variant="outline" onClick={() => navigate('/tasks')}>
                      Tinjau Semua Tugas
                    </Button>
                  }
                />
              ) : (
                <ul className="space-y-2.5">
                  {upcomingDeadlines.map((task) => {
                    const overdue = isTaskOverdue(task.due_date, task.semantic_type);
                    return (
                      <li
                        key={task.id}
                        className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 space-y-1.5">
                          <button
                            type="button"
                            onClick={() => openTaskDrawer(task.id)}
                            className="text-left text-sm font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent-text)] hover:underline"
                          >
                            {task.title}
                          </button>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <PriorityBadge priority={task.priority} />
                            <StatusBadge>{task.column_name}</StatusBadge>
                            {overdue && <OverdueTag />}
                            {task.due_date && (
                              <span className="text-xs text-[var(--color-text-muted)]">
                                {formatDateId(task.due_date)}
                              </span>
                            )}
                          </div>
                        </div>

                        <Button variant="outline" size="sm" onClick={() => handleLaunchFocus(task)} className="shrink-0 rounded-full">
                          <Timer className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                          <span>Fokus</span>
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 lg:col-span-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Aktivitas Terbaru</h2>
                  <p className="text-xs text-[var(--color-text-secondary)]">Riwayat aksi workspace terkini.</p>
                </div>
                <Activity className="h-4 w-4 text-[var(--color-text-muted)]" strokeWidth={1.75} aria-hidden="true" />
              </div>

              {activities.length === 0 ? (
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Belum ada aktivitas tercatat. Setiap perubahan tugas, sprint, atau sesi fokus akan muncul di sini.
                </p>
              ) : (
                <ul className="space-y-3">
                  {activities.map((act) => (
                    <li
                      key={act.id}
                      className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-2.5"
                    >
                      <p className="text-xs font-medium text-[var(--color-text-primary)]">{describeActivity(act)}</p>
                      <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                        {formatRelativeDateTime(act.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
