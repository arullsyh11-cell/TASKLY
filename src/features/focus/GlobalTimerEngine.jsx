import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTimerStore } from '../../stores/useTimerStore.js';
import { repo } from '../../services/repositories/index.js';
import { formatSecondsClock } from '../../utils/dateUtils.js';
import { sendFocusNotification, startFocusRingtone, stopFocusRingtone } from '../../utils/focusAudio.js';

export function GlobalTimerEngine() {
  const status = useTimerStore((s) => s.status);
  const mode = useTimerStore((s) => s.mode);
  const remainingSec = useTimerStore((s) => s.remainingSec);
  const isRinging = useTimerStore((s) => s.isRinging);
  const pendingSync = useTimerStore((s) => s.pendingSync);
  const tick = useTimerStore((s) => s.tick);
  const setRinging = useTimerStore((s) => s.setRinging);
  const addPendingSync = useTimerStore((s) => s.addPendingSync);
  const removePendingSync = useTimerStore((s) => s.removePendingSync);
  const syncDurationsFromSettings = useTimerStore((s) => s.syncDurationsFromSettings);
  const queryClient = useQueryClient();
  const handlingFinishRef = useRef(false);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => repo.settings.get(),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (settings) {
      syncDurationsFromSettings(settings);
    }
  }, [settings, syncDurationsFromSettings]);

  // Stop active ringtone immediately whenever ringing state is cleared
  useEffect(() => {
    if (!isRinging) {
      stopFocusRingtone();
    }
  }, [isRinging]);

  // Retry any offline/failed focus session saves automatically
  useEffect(() => {
    if (!pendingSync || pendingSync.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const item of pendingSync) {
        if (cancelled) break;
        try {
          await repo.focus.logSession(item.payload);
          removePendingSync(item.id);
          queryClient.invalidateQueries({ queryKey: ['focus'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          queryClient.invalidateQueries({ queryKey: ['analytics'] });
        } catch {
          // keep in queue
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingSync, removePendingSync, queryClient]);

  // Drift-free timer tick + browser tab title sync
  useEffect(() => {
    if (status === 'running') {
      const modeName =
        mode === 'short_break' ? 'Short Break' : mode === 'long_break' ? 'Long Break' : 'Focus';
      document.title = `(${formatSecondsClock(remainingSec)}) ${modeName} | TASKLY`;
    } else if (isRinging) {
      document.title = 'Time Up! | TASKLY';
    } else {
      document.title = 'TASKLY | Productivity & Workflow Workspace';
    }
  }, [status, mode, remainingSec, isRinging]);

  useEffect(() => {
    if (status !== 'running') {
      handlingFinishRef.current = false;
      return;
    }

    const interval = setInterval(async () => {
      const res = tick();
      if (res.finished && !handlingFinishRef.current) {
        handlingFinishRef.current = true;
        const isBreak = res.sessionPayload.mode === 'short_break' || res.sessionPayload.mode === 'long_break';
        const title = isBreak ? 'Break Finished!' : 'Focus Session Complete!';
        const taskLabel = useTimerStore.getState().selectedTaskTitle || 'General Focus';
        const body = isBreak
          ? 'Time to return to your priority tasks.'
          : `Target "${taskLabel}" completed and logged to your stats.`;

        const soundOn = settings?.sound_enabled !== false;
        if (soundOn) {
          setRinging(true);
          startFocusRingtone({
            maxCycles: 6,
            intervalMs: 2000,
            onEnded: () => setRinging(false),
          });
        }

        sendFocusNotification(title, body);

        toast.success(isBreak ? 'Break finished.' : 'Focus session completed and logged.', {
          duration: 12000,
          description: body,
          action: soundOn
            ? {
                label: 'Mute Sound',
                onClick: () => {
                  stopFocusRingtone();
                  setRinging(false);
                },
              }
            : undefined,
        });

        try {
          await repo.focus.logSession(res.sessionPayload);
          queryClient.invalidateQueries({ queryKey: ['focus'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          queryClient.invalidateQueries({ queryKey: ['analytics'] });
        } catch {
          addPendingSync(res.sessionPayload);
          toast.error('Session saved locally due to a connection issue.');
        }
      }
    }, 250);

    return () => clearInterval(interval);
  }, [status, tick, setRinging, settings, queryClient, addPendingSync]);

  return null;
}
