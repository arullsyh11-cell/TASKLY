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
        mode === 'short_break' ? 'Istirahat' : mode === 'long_break' ? 'Istirahat Panjang' : 'Fokus';
      document.title = `(${formatSecondsClock(remainingSec)}) ${modeName} | TASKLY`;
    } else if (isRinging) {
      document.title = 'Waktu Habis! | TASKLY';
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
        const title = isBreak ? 'Waktu Istirahat Selesai!' : 'Sesi Fokus Selesai!';
        const taskLabel = useTimerStore.getState().selectedTaskTitle || 'Fokus Umum';
        const body = isBreak
          ? 'Saatnya kembali melanjutkan tugas prioritas Anda.'
          : `Target "${taskLabel}" selesai dan tercatat ke statistik.`;

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

        toast.success(isBreak ? 'Waktu istirahat selesai.' : 'Sesi fokus selesai dan tercatat.', {
          duration: 12000,
          description: body,
          action: soundOn
            ? {
                label: 'Matikan Nada',
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
          toast.error('Sesi disimpan lokal sementara karena koneksi bermasalah.');
        }
      }
    }, 250);

    return () => clearInterval(interval);
  }, [status, tick, setRinging, settings, queryClient, addPendingSync]);

  return null;
}
