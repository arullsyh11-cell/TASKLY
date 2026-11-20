import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BellOff, ChevronRight, Pause, PictureInPicture2, Play, RotateCcw, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTimerStore } from '../../stores/useTimerStore.js';
import { useUiStore } from '../../stores/useUiStore.js';
import { repo } from '../../services/repositories/index.js';
import { formatSecondsClock } from '../../utils/dateUtils.js';
import { stopFocusRingtone } from '../../utils/focusAudio.js';
import {
  armFocusPipOnStart,
  subscribePipActive,
  syncFocusPipState,
  toggleFocusPipWindow,
} from '../../utils/focusPipEngine.js';

function getModePromptLabel(mode, status, isRinging, taskTitle) {
  if (isRinging || status === 'completed') {
    if (mode === 'short_break' || mode === 'long_break') return 'Break finished';
    return `Session complete: ${taskTitle}`;
  }
  if (status === 'paused') {
    return `Timer paused: ${taskTitle}`;
  }
  if (mode === 'short_break') return 'Short break in progress...';
  if (mode === 'long_break') return 'Long break in progress...';
  return `Focusing on: ${taskTitle}...`;
}

export function FocusExpandedPopup() {
  const status = useTimerStore((s) => s.status);
  const mode = useTimerStore((s) => s.mode);
  const plannedSec = useTimerStore((s) => s.plannedSec);
  const remainingSec = useTimerStore((s) => s.remainingSec);
  const startedAtIso = useTimerStore((s) => s.startedAtIso);
  const selectedTaskId = useTimerStore((s) => s.selectedTaskId);
  const selectedTaskTitle = useTimerStore((s) => s.selectedTaskTitle);
  const isRinging = useTimerStore((s) => s.isRinging);
  const pause = useTimerStore((s) => s.pause);
  const resume = useTimerStore((s) => s.resume);
  const reset = useTimerStore((s) => s.reset);
  const start = useTimerStore((s) => s.start);
  const stopRinging = useTimerStore((s) => s.stopRinging);
  const addPendingSync = useTimerStore((s) => s.addPendingSync);
  const theme = useUiStore((s) => s.theme);

  const location = useLocation();
  const queryClient = useQueryClient();
  const [pipActive, setPipActive] = useState(false);

  const active = status === 'running' || status === 'paused' || status === 'completed' || isRinging;
  const onFocusRoute = location.pathname === '/focus';

  useEffect(() => {
    return subscribePipActive(setPipActive);
  }, []);

  const logSessionMutation = useMutation({
    mutationFn: (payload) => repo.focus.logSession(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['focus'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });

  useEffect(() => {
    syncFocusPipState({
      status,
      mode,
      plannedSec,
      remainingSec,
      selectedTaskTitle,
      isRinging,
      theme,
      onPause: () => useTimerStore.getState().pause(),
      onResume: () => useTimerStore.getState().resume(),
      onStop: () => {
        stopFocusRingtone();
        useTimerStore.getState().stopRinging();
        useTimerStore.getState().reset();
      },
    });
  }, [status, mode, plannedSec, remainingSec, selectedTaskTitle, isRinging, theme]);

  useEffect(() => {
    if (status === 'running') {
      armFocusPipOnStart();
    }
  }, [status]);

  if (!active) return null;

  const progress = plannedSec > 0 ? Math.min(1, Math.max(0, (plannedSec - remainingSec) / plannedSec)) : 0;
  const elapsedSec = Math.max(0, plannedSec - remainingSec);
  const isDone = status === 'completed' || isRinging;
  const headline = getModePromptLabel(mode, status, isRinging, selectedTaskTitle);

  const ringSize = 58;
  const ringStroke = 4.5;
  const radius = (ringSize - ringStroke) / 2;
  const circ = 2 * Math.PI * radius;
  const visualProgress = isDone ? 1 : Math.max(0.04, progress);
  const dashOffset = circ * (1 - visualProgress);

  function handlePrimaryIslandAction() {
    if (isRinging) {
      stopFocusRingtone();
      stopRinging();
      return;
    }
    if (status === 'running') {
      pause();
    } else if (status === 'paused') {
      resume();
    } else if (status === 'completed') {
      reset();
      start();
    }
  }

  async function handleStopOrDismiss() {
    stopFocusRingtone();
    stopRinging();
    if ((status === 'running' || status === 'paused') && elapsedSec >= 60) {
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
        await logSessionMutation.mutateAsync(payload);
        toast.success(`Logged ${Math.round(elapsedSec / 60)}-minute focus session.`);
      } catch {
        addPendingSync(payload);
        toast.info('Focus duration saved temporarily to local queue.');
      }
    } else {
      reset();
    }
  }

  async function handleTogglePip() {
    const opened = await toggleFocusPipWindow();
    if (!opened && !pipActive) {
      toast.info('Dynamic Focus popup stays active automatically across all pages and system notifications.');
    }
  }

  return (
    <aside
      role="region"
      aria-label="Focus Mode timer popup"
      className="focus-island-frame fixed left-1/2 top-[calc(0.5rem+env(safe-area-inset-top))] z-[75] w-[calc(100%-1.5rem)] max-w-[392px] -translate-x-1/2 rounded-[28px] p-[1.5px]"
    >
      <div className="focus-island-surface rounded-[26.5px] px-5 pb-3.5 pt-3.5 text-white">
        {/* Top Centered Title (Always Persistent Like Dynamic Island) */}
        <div className="flex items-center justify-center px-3">
          <p className="truncate text-center text-xs font-medium tracking-tight text-white/80">
            {headline}
          </p>
        </div>

        {/* Middle Row: Big Tabular Timer Left + Circular Progress Ring & Emblem Right */}
        <div className="mt-2.5 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <span className="text-xs font-medium text-white/65">
              {isDone ? 'Done' : status === 'paused' ? 'Paused' : 'Timer'}
            </span>
            <p
              aria-live="off"
              className="font-mono-num text-[2.45rem] sm:text-[2.7rem] font-normal leading-none tracking-tight text-white tabular-nums"
            >
              {formatSecondsClock(remainingSec)}
            </p>
          </div>

          <div className="relative flex h-[58px] w-[58px] shrink-0 items-center justify-center">
            <svg width={ringSize} height={ringSize} className="-rotate-90" aria-hidden="true">
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                fill="none"
                stroke="var(--island-ring-track)"
                strokeWidth={ringStroke}
              />
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                fill="none"
                stroke={isDone ? 'var(--color-success)' : 'var(--island-ring-stroke)'}
                strokeWidth={ringStroke}
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={dashOffset}
                className="transition-[stroke-dashoffset] duration-300"
              />
            </svg>
            <span className="absolute inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
              <svg width="18" height="18" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <rect x="4" y="12" width="32" height="10" rx="4" fill="#FFFFFF" />
                <rect x="14" y="27" width="36" height="10" rx="4" fill="#FFFFFF" />
                <rect x="24" y="42" width="22" height="10" rx="4" fill="#FFFFFF" />
                <rect x="50" y="42" width="10" height="10" rx="3.5" fill="var(--island-ring-stroke)" />
              </svg>
            </span>
          </div>
        </div>

        {/* Hairline Separator */}
        <div className="my-3 h-px w-full bg-white/12" aria-hidden="true" />

        {/* Bottom Controls Bar: Pause/Play + X left, Out-of-App Floating PiP & Open Focus right */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handlePrimaryIslandAction}
              aria-label={
                isRinging
                  ? 'Mute ringtone'
                  : status === 'running'
                  ? 'Pause focus session'
                  : status === 'paused'
                  ? 'Resume focus session'
                  : 'Restart focus session'
              }
              title={
                isRinging
                  ? 'Mute Sound'
                  : status === 'running'
                  ? 'Pause'
                  : status === 'paused'
                  ? 'Resume'
                  : 'Restart'
              }
              style={{
                backgroundColor: 'var(--island-pause-bg)',
                color: 'var(--island-pause-fg)',
              }}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-95 hover:brightness-110"
            >
              {isRinging ? (
                <BellOff className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
              ) : status === 'running' ? (
                <Pause className="h-5 w-5 fill-current" strokeWidth={1.75} aria-hidden="true" />
              ) : status === 'paused' ? (
                <Play className="ml-0.5 h-5 w-5 fill-current" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <RotateCcw className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={handleStopOrDismiss}
              aria-label={isDone ? 'Close focus timer popup' : 'Stop focus timer'}
              title={isDone ? 'Close' : 'Stop Timer'}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/14 text-white/90 transition-colors active:scale-95 hover:bg-white/24"
            >
              <X className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleTogglePip}
              aria-label={pipActive ? 'Close floating out-of-app window' : 'Pop out floating timer window'}
              title="Keep timer floating outside the app (Picture-in-Picture)"
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors ${
                pipActive
                  ? 'bg-white/20 text-white'
                  : 'text-white/85 hover:bg-white/10 hover:text-white'
              }`}
            >
              <PictureInPicture2 className="h-4 w-4 shrink-0" strokeWidth={1.85} aria-hidden="true" />
              <span>{onFocusRoute ? (pipActive ? 'Floating Active' : 'Float Window') : 'PiP'}</span>
            </button>

            {!onFocusRoute && (
              <Link
                to="/focus"
                className="inline-flex min-h-[44px] items-center gap-1 rounded-full px-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white"
              >
                <span>Open Focus</span>
                <ChevronRight className="h-4 w-4 text-white/75" strokeWidth={2} aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
