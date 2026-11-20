import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing, CheckCircle2, Clock, Maximize2, Minimize2, Pause, Play, RotateCcw, StopCircle, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { repo } from '../../services/repositories/index.js';
import { useTimerStore } from '../../stores/useTimerStore.js';
import { useUiStore } from '../../stores/useUiStore.js';
import { Button } from '../../components/ui/Button.jsx';
import { Dropdown } from '../../components/ui/Dropdown.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States.jsx';
import { ConfirmationDialog } from '../../components/feedback/ConfirmationDialog.jsx';
import { formatDurationHuman, formatRelativeDateTime, formatSecondsClock } from '../../utils/dateUtils.js';
import {
  enterNativeFullscreen,
  exitNativeFullscreen,
  getFullscreenElement,
} from '../../utils/fullscreenUtils.js';
import {
  getNotificationPermissionState,
  playFocusChime,
  requestFocusNotificationPermission,
  sendFocusNotification,
  stopFocusRingtone,
} from '../../utils/focusAudio.js';
import { armFocusPipOnStart } from '../../utils/focusPipEngine.js';

const MODE_OPTIONS = [
  { id: 'focus', label: 'Focus' },
  { id: 'short_break', label: 'Short Break' },
  { id: 'long_break', label: 'Long Break' },
  { id: 'custom', label: 'Custom' },
];

export function FocusModePage() {
  const mode = useTimerStore((s) => s.mode);
  const durationsMin = useTimerStore((s) => s.durationsMin);
  const plannedSec = useTimerStore((s) => s.plannedSec);
  const remainingSec = useTimerStore((s) => s.remainingSec);
  const status = useTimerStore((s) => s.status);
  const startedAtIso = useTimerStore((s) => s.startedAtIso);
  const selectedTaskId = useTimerStore((s) => s.selectedTaskId);
  const selectedTaskTitle = useTimerStore((s) => s.selectedTaskTitle);
  const setMode = useTimerStore((s) => s.setMode);
  const setModeDuration = useTimerStore((s) => s.setModeDuration);
  const selectTask = useTimerStore((s) => s.selectTask);
  const start = useTimerStore((s) => s.start);
  const pause = useTimerStore((s) => s.pause);
  const resume = useTimerStore((s) => s.resume);
  const reset = useTimerStore((s) => s.reset);
  const isRinging = useTimerStore((s) => s.isRinging);
  const stopRinging = useTimerStore((s) => s.stopRinging);
  const addPendingSync = useTimerStore((s) => s.addPendingSync);

  const openTaskDrawer = useUiStore((s) => s.openTaskDrawer);
  const queryClient = useQueryClient();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [customMinDraft, setCustomMinDraft] = useState(String(durationsMin[mode] || 25));
  const [notifPermission, setNotifPermission] = useState(() => getNotificationPermissionState());

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', { scope: 'focus-picker' }],
    queryFn: () => repo.tasks.list({ sort: 'priority' }),
  });

  const { data: columns = [] } = useQuery({
    queryKey: ['columns'],
    queryFn: () => repo.columns.list(),
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['focus', 'stats'],
    queryFn: () => repo.focus.getStats(),
  });

  const {
    data: sessions = [],
    isLoading: sessionsLoading,
    isError: sessionsError,
    error: sessionsErrObj,
    refetch: refetchSessions,
  } = useQuery({
    queryKey: ['focus', 'sessions'],
    queryFn: () => repo.focus.listSessions(25),
  });

  const activeTasks = tasks.filter((t) => t.semantic_type !== 'done');
  const elapsedSec = Math.max(0, plannedSec - remainingSec);
  const progressRatio = plannedSec > 0 ? Math.min(1, Math.max(0, (plannedSec - remainingSec) / plannedSec)) : 0;

  const markTaskDoneMutation = useMutation({
    mutationFn: (taskId) => {
      const doneCol = columns.find((c) => c.semantic_type === 'done');
      if (!doneCol) throw new Error('Done column not found.');
      return repo.tasks.update(taskId, { column_id: doneCol.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['sprints'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      toast.success('Task marked as done.');
    },
    onError: (err) => toast.error(err.message),
  });

  async function handleCompleteEarly() {
    if (elapsedSec < 60) {
      reset();
      toast.info('Sessions under 1 minute are reset without logging.');
      return;
    }
    const payload = {
      task_id: selectedTaskId,
      mode,
      planned_duration_sec: plannedSec,
      actual_duration_sec: elapsedSec,
      status: 'interrupted',
      started_at: startedAtIso || new Date(Date.now() - elapsedSec * 1000).toISOString(),
      ended_at: new Date().toISOString(),
    };
    reset();
    try {
      await repo.focus.logSession(payload);
      queryClient.invalidateQueries({ queryKey: ['focus'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      toast.success(`Logged ${Math.round(elapsedSec / 60)}-minute focus session.`);
    } catch {
      addPendingSync(payload);
      toast.error('Connection issue; session saved to local queue.');
    }
  }

  function handleResetClick() {
    if ((status === 'running' || status === 'paused') && elapsedSec >= 60) {
      setConfirmResetOpen(true);
    } else {
      reset();
    }
  }

  useEffect(() => {
    function onFsChange() {
      if (!getFullscreenElement()) {
        setIsFullscreen(false);
      }
    }
    function onKeyDown(e) {
      if (e.key === 'Escape' && isFullscreen && !getFullscreenElement()) {
        setIsFullscreen(false);
      }
    }
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isFullscreen]);

  async function handleToggleFullscreen() {
    if (!isFullscreen) {
      setIsFullscreen(true);
      await enterNativeFullscreen();
    } else {
      setIsFullscreen(false);
      await exitNativeFullscreen();
    }
  }

  function handleModeSwitch(nextMode) {
    if (status === 'running') {
      toast.info('Pause or reset the timer before switching modes.');
      return;
    }
    setMode(nextMode);
    setCustomMinDraft(String(durationsMin[nextMode] || 25));
  }

  function handleApplyDuration(e) {
    e.preventDefault();
    const mins = Math.max(1, Math.min(180, Number(customMinDraft) || 25));
    setCustomMinDraft(String(mins));
    setModeDuration(mode, mins);
    toast.success(`${MODE_OPTIONS.find((m) => m.id === mode)?.label} duration set to ${mins} minutes.`);
  }

  // Ring geometry
  const size = 248;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progressRatio);

  function handleStartTimer() {
    if (notifPermission === 'default') {
      requestFocusNotificationPermission().then(setNotifPermission);
    }
    start();
    armFocusPipOnStart();
  }

  async function handleTestAlert() {
    playFocusChime();
    const perm = await requestFocusNotificationPermission();
    setNotifPermission(perm);
    if (perm === 'granted') {
      sendFocusNotification('TASKLY Focus Notifications Active', 'You will receive alerts and a ringtone when the timer finishes.');
      toast.success('Ringtone and browser notifications are active.');
    } else if (perm === 'denied') {
      toast.info('Ringtone played. Browser notification permission is currently blocked in site settings.');
    } else {
      toast.success('Ringtone preview played.');
    }
  }

  function handleStopRingtone() {
    stopFocusRingtone();
    stopRinging();
  }

  const hasActivePopup =
    status === 'running' || status === 'paused' || status === 'completed' || isRinging;

  return (
    <div
      className={
        isFullscreen
          ? `fixed inset-0 z-[60] flex flex-col justify-start gap-6 overflow-y-auto bg-[var(--color-bg)] px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-8 sm:pb-8 ${
              hasActivePopup
                ? 'pt-[calc(11.5rem+env(safe-area-inset-top))] sm:pt-48'
                : 'pt-[calc(1rem+env(safe-area-inset-top))] sm:pt-8 sm:justify-center'
            }`
          : 'space-y-8'
      }
    >
      <header className="mx-auto flex w-full max-w-2xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:max-w-none">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">Focus Mode</h1>
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
            Distraction-free workspace to run Pomodoro cycles and track focus time per task.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleTestAlert}>
            <Bell className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <span>{notifPermission === 'granted' ? 'Test Sound & Alerts' : 'Enable & Test Alerts'}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleToggleFullscreen}>
            {isFullscreen ? (
              <>
                <Minimize2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <span>Exit Fullscreen</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <span>Fullscreen Mode</span>
              </>
            )}
          </Button>
        </div>
      </header>

      {/* Main Minimalist Timer Stage */}
      <section
        aria-label="Focus Mode timer"
        className="mx-auto flex max-w-2xl flex-col items-center rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-8 sm:px-10"
      >
        {/* Mode Switcher */}
        <div role="tablist" aria-label="Select timer mode" className="flex flex-wrap justify-center gap-2">
          {MODE_OPTIONS.map((opt) => {
            const active = mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={status === 'running' && !active}
                onClick={() => handleModeSwitch(opt.id)}
                className={`min-h-[40px] rounded-[var(--radius-sm)] border px-3.5 text-xs font-semibold transition-colors ${
                  active
                    ? 'border-[var(--color-primary)] bg-[var(--color-secondary)] text-[var(--color-text-primary)]'
                    : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {opt.label} ({durationsMin[opt.id]}m)
              </button>
            );
          })}
        </div>

        {/* Precision Timer Ring */}
        <div className="relative my-8 flex items-center justify-center">
          <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth={stroke}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-[stroke-dashoffset] duration-300"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
              {status === 'running'
                ? 'In Progress'
                : status === 'paused'
                ? 'Paused'
                : status === 'completed'
                ? 'Completed'
                : 'Ready'}
            </span>
            <p
              aria-live="off"
              className="mt-1 font-mono-num text-5xl font-bold tracking-tight text-[var(--color-text-primary)]"
            >
              {formatSecondsClock(remainingSec)}
            </p>
          </div>
        </div>

        {/* Task Binding Selector */}
        <div className="w-full max-w-md space-y-2">
          <div className="flex items-end gap-2">
            <Dropdown
              id="focus-task-picker"
              label="Active Task"
              searchable
              searchPlaceholder="Search active task title..."
              value={selectedTaskId || ''}
              onChange={(tid) => {
                const found = activeTasks.find((t) => t.id === tid);
                selectTask(tid || null, found?.title || 'General Focus');
              }}
              options={[
                { value: '', label: 'General Focus (No Specific Task)' },
                ...activeTasks.map((t) => ({
                  value: t.id,
                  label: t.title,
                  hint: `${t.priority.toUpperCase()} | ${t.column_name}`,
                })),
              ]}
              className="min-w-0 flex-1"
            />
            {selectedTaskId && (
              <Button variant="outline" onClick={() => openTaskDrawer(selectedTaskId)} className="min-h-[42px] shrink-0">
                Details
              </Button>
            )}
          </div>
        </div>

        {/* Primary Timer Controls (>= 48px touch target friendly) */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {status === 'idle' && (
            <Button size="lg" onClick={handleStartTimer} className="min-h-[48px] min-w-[148px]">
              <Play className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>Start Timer</span>
            </Button>
          )}
          {status === 'running' && (
            <Button size="lg" variant="secondary" onClick={pause} className="min-h-[48px] min-w-[148px]">
              <Pause className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>Pause</span>
            </Button>
          )}
          {status === 'paused' && (
            <Button size="lg" onClick={resume} className="min-h-[48px] min-w-[148px]">
              <Play className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>Resume</span>
            </Button>
          )}
          {status === 'completed' && (
            <Button size="lg" onClick={reset} className="min-h-[48px] min-w-[148px]">
              <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>New Session</span>
            </Button>
          )}

          {(status === 'running' || status === 'paused') && (
            <>
              <Button size="lg" variant="outline" onClick={handleCompleteEarly} className="min-h-[48px]">
                <StopCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <span>End &amp; Log</span>
              </Button>
              <Button
                size="lg"
                variant="ghost"
                onClick={handleResetClick}
                aria-label="Reset timer"
                className="min-h-[48px]"
              >
                <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <span>Reset</span>
              </Button>
            </>
          )}
        </div>

        {/* Active Ringtone Banner */}
        {isRinging && (
          <div
            role="alert"
            className="mt-5 flex w-full max-w-md flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-primary)] bg-[var(--color-surface-warm)] px-4 py-3"
          >
            <div className="flex items-center gap-2.5">
              <BellRing className="h-4 w-4 shrink-0 text-[var(--color-accent-text)]" strokeWidth={1.75} aria-hidden="true" />
              <span className="text-xs font-semibold text-[var(--color-text-primary)]">
                Time is up! Ringtone is playing.
              </span>
            </div>
            <Button size="sm" onClick={handleStopRingtone}>
              <Volume2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              <span>Mute Sound</span>
            </Button>
          </div>
        )}

        {/* Post-Completion Action Prompt */}
        {status === 'completed' && (
          <div className="mt-6 w-full max-w-md rounded-[var(--radius-md)] border border-[var(--color-border-warm)] bg-[var(--color-surface-warm)] p-4 text-center">
            <p className="text-sm font-semibold text-[var(--color-accent-text)]">
              Session complete: {selectedTaskTitle}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {selectedTaskId && (
                <Button
                  size="sm"
                  isLoading={markTaskDoneMutation.isPending}
                  onClick={() => markTaskDoneMutation.mutate(selectedTaskId)}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  <span>Mark Task Done</span>
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="bg-[var(--color-bg)]"
                onClick={() => {
                  reset();
                  setMode('short_break');
                }}
              >
                Start Short Break ({durationsMin.short_break}m)
              </Button>
            </div>
          </div>
        )}

        {/* Quick Duration Adjustment (only editable when not running) */}
        <form onSubmit={handleApplyDuration} className="mt-6 flex flex-wrap items-center justify-center gap-2 border-t border-[var(--color-border)] pt-5 text-xs">
          <label htmlFor="duration-custom-input" className="text-[var(--color-text-secondary)]">
            Adjust {MODE_OPTIONS.find((m) => m.id === mode)?.label} duration (min):
          </label>
          <input
            id="duration-custom-input"
            type="number"
            min={1}
            max={180}
            disabled={status === 'running'}
            value={customMinDraft}
            onChange={(e) => setCustomMinDraft(e.target.value)}
            className="h-10 w-20 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-center font-mono-num text-base sm:text-sm text-[var(--color-text-primary)] disabled:opacity-50"
          />
          <Button type="submit" size="sm" variant="outline" disabled={status === 'running'}>
            Apply
          </Button>
        </form>
      </section>

      {/* Daily Focus Stats + Session History */}
      {!isFullscreen && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 lg:col-span-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Daily Focus Stats</h2>
          {statsLoading ? (
            <div className="mt-4">
              <LoadingState label="Loading focus stats..." rows={2} />
            </div>
          ) : (
            <dl className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-3">
                <dt className="text-xs text-[var(--color-text-secondary)]">Completed Sessions Today</dt>
                <dd className="font-mono-num text-lg font-semibold text-[var(--color-accent-text)]">
                  {stats?.today_completed_sessions ?? 0}
                </dd>
              </div>
              <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-3">
                <dt className="text-xs text-[var(--color-text-secondary)]">Total Focus Time Today</dt>
                <dd className="font-mono-num text-lg font-semibold text-[var(--color-text-primary)]">
                  {formatDurationHuman(stats?.today_focus_sec ?? 0)}
                </dd>
              </div>
              <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-3">
                <dt className="text-xs text-[var(--color-text-secondary)]">All-Time Focus Total</dt>
                <dd className="font-mono-num text-lg font-semibold text-[var(--color-text-primary)]">
                  {formatDurationHuman(stats?.total_focus_sec ?? 0)}
                </dd>
              </div>
            </dl>
          )}
        </section>

        <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 lg:col-span-8">
          <h2 className="mb-3 text-base font-semibold text-[var(--color-text-primary)]">Focus Session History</h2>
          {sessionsLoading ? (
            <LoadingState label="Loading session history..." rows={3} />
          ) : sessionsError ? (
            <ErrorState message={sessionsErrObj?.message} onRetry={refetchSessions} />
          ) : sessions.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No focus sessions recorded yet"
              description="Select a task or run your first 25-minute focus session to start building your history."
            />
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">{s.task_label}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {formatRelativeDateTime(s.started_at)} | Mode: {s.mode.replace('_', ' ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono-num text-xs font-semibold text-[var(--color-text-primary)]">
                      {formatDurationHuman(s.actual_duration_sec)}
                    </span>
                    <StatusBadge tone={s.status === 'completed' ? 'success' : 'warning'}>
                      {s.status === 'completed' ? 'Completed' : 'Interrupted'}
                    </StatusBadge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      )}

      <ConfirmationDialog
        open={confirmResetOpen}
        onClose={() => setConfirmResetOpen(false)}
        onConfirm={() => {
          reset();
          setConfirmResetOpen(false);
        }}
        title="Reset Focus Session?"
        description="The timer has been running for over 1 minute. Resetting will discard the elapsed time without logging it. Use 'End & Log' to save this duration."
        confirmLabel="Yes, Reset Timer"
      />
    </div>
  );
}
