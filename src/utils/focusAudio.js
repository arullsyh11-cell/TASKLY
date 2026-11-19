let activeRingInterval = null;

function playSinglePhrase(ctx) {
  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5];

  notes.forEach((freq, idx) => {
    const startAt = now + idx * 0.13;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, startAt);

    gain.gain.setValueAtTime(0.001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.18, startAt + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.55);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + 0.6);
  });
}

function getAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  const ctx = new AudioCtx();
  if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
    ctx.resume().catch(() => { });
  }
  return ctx;
}

export function playFocusChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    playSinglePhrase(ctx);
  } catch {
    // Ignore autoplay blocks gracefully
  }
}

export function playReminderChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [587.33, 880];
    notes.forEach((freq, idx) => {
      const startAt = now + idx * 0.14;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startAt);

      gain.gain.setValueAtTime(0.001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.11, startAt + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + 0.5);
    });
  } catch {
    // Ignore autoplay blocks gracefully
  }
}

export function stopFocusRingtone() {
  if (activeRingInterval !== null) {
    clearInterval(activeRingInterval);
    activeRingInterval = null;
  }
}

export function startFocusRingtone({ maxCycles = 6, intervalMs = 2000, onEnded } = {}) {
  stopFocusRingtone();
  try {
    const ctx = getAudioContext();
    if (!ctx) {
      onEnded?.();
      return;
    }

    let cycles = 1;
    playSinglePhrase(ctx);

    activeRingInterval = setInterval(() => {
      if (cycles >= maxCycles) {
        stopFocusRingtone();
        onEnded?.();
        return;
      }
      cycles += 1;
      try {
        if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
          ctx.resume().catch(() => { });
        }
        playSinglePhrase(ctx);
      } catch {
        stopFocusRingtone();
        onEnded?.();
      }
    }, intervalMs);
  } catch {
    stopFocusRingtone();
    onEnded?.();
  }
}

export function getNotificationPermissionState() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestFocusNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function sendFocusNotification(title, body, tag = 'taskly-focus-complete') {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  try {
    const n = new Notification(title, {
      body,
      icon: '/icon-192.png',
      tag,
    });
    n.onclick = () => {
      window.focus?.();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

export function sendReminderNotification(title, body, tag = 'taskly-deadline-reminder') {
  return sendFocusNotification(title, body, tag);
}
