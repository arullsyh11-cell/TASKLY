import { create } from 'zustand';

const REMINDER_STATE_KEY = 'taskly_reminder_state_v1';

function loadState() {
  try {
    const raw = localStorage.getItem(REMINDER_STATE_KEY);
    if (!raw) return { dispatched: {}, acknowledged: {} };
    const parsed = JSON.parse(raw);
    return {
      dispatched: parsed?.dispatched && typeof parsed.dispatched === 'object' ? parsed.dispatched : {},
      acknowledged: parsed?.acknowledged && typeof parsed.acknowledged === 'object' ? parsed.acknowledged : {},
    };
  } catch {
    return { dispatched: {}, acknowledged: {} };
  }
}

function saveState(dispatched, acknowledged) {
  try {
    const trimEntries = (obj) => {
      const keys = Object.keys(obj);
      if (keys.length <= 250) return obj;
      const sliced = {};
      keys.slice(-200).forEach((k) => {
        sliced[k] = obj[k];
      });
      return sliced;
    };
    localStorage.setItem(
      REMINDER_STATE_KEY,
      JSON.stringify({
        dispatched: trimEntries(dispatched),
        acknowledged: trimEntries(acknowledged),
      })
    );
  } catch {
    // ignore storage errors
  }
}

const initial = loadState();

export const useReminderStore = create((set, get) => ({
  dispatched: initial.dispatched,
  acknowledged: initial.acknowledged,

  markDispatched(signatures = []) {
    if (!signatures.length) return;
    const next = { ...get().dispatched };
    const now = new Date().toISOString();
    let changed = false;
    for (const sig of signatures) {
      if (!next[sig]) {
        next[sig] = now;
        changed = true;
      }
    }
    if (!changed) return;
    saveState(next, get().acknowledged);
    set({ dispatched: next });
  },

  markAcknowledged(signature) {
    if (!signature) return;
    const next = { ...get().acknowledged, [signature]: true };
    saveState(get().dispatched, next);
    set({ acknowledged: next });
  },

  markAllAcknowledged(signatures = []) {
    if (!signatures.length) return;
    const next = { ...get().acknowledged };
    signatures.forEach((sig) => {
      next[sig] = true;
    });
    saveState(get().dispatched, next);
    set({ acknowledged: next });
  },

  resetAll() {
    saveState({}, {});
    set({ dispatched: {}, acknowledged: {} });
  },
}));
