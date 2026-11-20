import { create } from 'zustand';

const TIMER_KEY = 'taskly_timer_state';
const PENDING_SYNC_KEY = 'taskly_pending_focus_sync';

function loadSavedTimer() {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveTimer(state) {
  try {
    localStorage.setItem(
      TIMER_KEY,
      JSON.stringify({
        mode: state.mode,
        plannedSec: state.plannedSec,
        remainingSec: state.remainingSec,
        status: state.status,
        targetEndMs: state.targetEndMs,
        startedAtIso: state.startedAtIso,
        selectedTaskId: state.selectedTaskId,
        selectedTaskTitle: state.selectedTaskTitle,
        durationsMin: state.durationsMin,
      })
    );
  } catch {
    // ignore
  }
}

function loadPendingSync() {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePendingSync(list) {
  try {
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

const DEFAULT_DURATIONS = {
  focus: 25,
  short_break: 5,
  long_break: 15,
  custom: 30,
};

const saved = loadSavedTimer();
const initialDurations = saved?.durationsMin || DEFAULT_DURATIONS;

function resolveInitialRemaining() {
  if (!saved) return initialDurations.focus * 60;
  if (saved.status === 'running' && saved.targetEndMs) {
    return Math.max(0, Math.ceil((saved.targetEndMs - Date.now()) / 1000));
  }
  return saved.remainingSec ?? initialDurations.focus * 60;
}

export const useTimerStore = create((set, get) => ({
  mode: saved?.mode || 'focus',
  durationsMin: initialDurations,
  plannedSec: saved?.plannedSec || initialDurations.focus * 60,
  remainingSec: resolveInitialRemaining(),
  status: saved?.status || 'idle', // idle | running | paused | completed
  targetEndMs: saved?.targetEndMs || null,
  startedAtIso: saved?.startedAtIso || null,
  selectedTaskId: saved?.selectedTaskId || null,
  selectedTaskTitle:
    saved?.selectedTaskTitle && saved.selectedTaskTitle !== 'Fokus Umum'
      ? saved.selectedTaskTitle
      : 'General Focus',
  pendingSync: loadPendingSync(),
  isRinging: false,
  islandMode: 'compact', // 'compact' | 'expanded'

  setIslandMode(nextMode) {
    set({ islandMode: nextMode === 'expanded' ? 'expanded' : 'compact' });
  },

  setRinging(val) {
    set({ isRinging: Boolean(val) });
  },

  stopRinging() {
    set({ isRinging: false });
  },

  syncDurationsFromSettings(settings) {
    if (!settings) return;
    const state = get();
    const nextDurations = {
      ...state.durationsMin,
      focus: settings.pomodoro_focus_min || 25,
      short_break: settings.pomodoro_short_break_min || 5,
      long_break: settings.pomodoro_long_break_min || 15,
    };
    const nextPatch = { durationsMin: nextDurations };
    if (state.status === 'idle' && nextDurations[state.mode]) {
      const sec = nextDurations[state.mode] * 60;
      nextPatch.plannedSec = sec;
      nextPatch.remainingSec = sec;
    }
    set(nextPatch);
    saveTimer({ ...get(), ...nextPatch });
  },

  setMode(mode) {
    const state = get();
    if (state.status === 'running') return;
    const mins = state.durationsMin[mode] || 25;
    const sec = mins * 60;
    const patch = {
      mode,
      plannedSec: sec,
      remainingSec: sec,
      status: 'idle',
      targetEndMs: null,
      startedAtIso: null,
    };
    set(patch);
    saveTimer({ ...get(), ...patch });
  },

  setModeDuration(mode, minutes) {
    const state = get();
    if (state.status === 'running') return;
    const clamped = Math.max(1, Math.min(180, Number(minutes) || 25));
    const nextDurations = { ...state.durationsMin, [mode]: clamped };
    const patch = { durationsMin: nextDurations };
    if (state.mode === mode) {
      patch.plannedSec = clamped * 60;
      patch.remainingSec = clamped * 60;
      patch.status = 'idle';
      patch.targetEndMs = null;
      patch.startedAtIso = null;
    }
    set(patch);
    saveTimer({ ...get(), ...patch });
  },

  selectTask(taskId, taskTitle) {
    const patch = {
      selectedTaskId: taskId || null,
      selectedTaskTitle: taskId ? taskTitle || 'Selected Task' : 'General Focus',
    };
    set(patch);
    saveTimer({ ...get(), ...patch });
  },

  start() {
    const state = get();
    const sec = state.remainingSec > 0 ? state.remainingSec : state.plannedSec;
    const now = Date.now();
    const patch = {
      status: 'running',
      remainingSec: sec,
      targetEndMs: now + sec * 1000,
      startedAtIso: state.startedAtIso || new Date(now).toISOString(),
      isRinging: false,
      islandMode: 'expanded',
    };
    set(patch);
    saveTimer({ ...get(), ...patch });
  },

  pause() {
    const state = get();
    if (state.status !== 'running') return;
    const rem = state.targetEndMs ? Math.max(0, Math.ceil((state.targetEndMs - Date.now()) / 1000)) : state.remainingSec;
    const patch = {
      status: 'paused',
      remainingSec: rem,
      targetEndMs: null,
    };
    set(patch);
    saveTimer({ ...get(), ...patch });
  },

  resume() {
    const state = get();
    if (state.status !== 'paused') return;
    const now = Date.now();
    const patch = {
      status: 'running',
      targetEndMs: now + state.remainingSec * 1000,
    };
    set(patch);
    saveTimer({ ...get(), ...patch });
  },

  reset() {
    const state = get();
    const sec = (state.durationsMin[state.mode] || 25) * 60;
    const patch = {
      plannedSec: sec,
      remainingSec: sec,
      status: 'idle',
      targetEndMs: null,
      startedAtIso: null,
      isRinging: false,
      islandMode: 'compact',
    };
    set(patch);
    saveTimer({ ...get(), ...patch });
  },

  tick() {
    const state = get();
    if (state.status !== 'running' || !state.targetEndMs) return { finished: false };
    const rem = Math.max(0, Math.ceil((state.targetEndMs - Date.now()) / 1000));
    if (rem <= 0) {
      const patch = {
        remainingSec: 0,
        status: 'completed',
        targetEndMs: null,
        islandMode: 'expanded',
      };
      set(patch);
      saveTimer({ ...get(), ...patch });
      return {
        finished: true,
        sessionPayload: {
          task_id: state.selectedTaskId,
          mode: state.mode,
          planned_duration_sec: state.plannedSec,
          actual_duration_sec: state.plannedSec,
          status: 'completed',
          started_at: state.startedAtIso || new Date(Date.now() - state.plannedSec * 1000).toISOString(),
          ended_at: new Date().toISOString(),
        },
      };
    }
    if (rem !== state.remainingSec) {
      set({ remainingSec: rem });
    }
    return { finished: false };
  },

  addPendingSync(payload) {
    const next = [...get().pendingSync, { id: Date.now(), payload }];
    savePendingSync(next);
    set({ pendingSync: next });
  },

  removePendingSync(id) {
    const next = get().pendingSync.filter((item) => item.id !== id);
    savePendingSync(next);
    set({ pendingSync: next });
  },
}));
