import { formatSecondsClock } from './dateUtils.js';

let canvasEl = null;
let ctx2d = null;
let videoEl = null;
let streamObj = null;
let pipListenersBound = false;
let latestState = null;
let manualPipPinned = false;
let lastNotifSec = -1;
const pipActiveListeners = new Set();

function notifyPipListeners(isActive) {
  pipActiveListeners.forEach((fn) => {
    try {
      fn(Boolean(isActive));
    } catch {
      // ignore
    }
  });
}

export function subscribePipActive(listener) {
  pipActiveListeners.add(listener);
  listener(isFocusPipActive());
  return () => pipActiveListeners.delete(listener);
}

export function isFocusPipActive() {
  if (typeof document === 'undefined') return false;
  return Boolean(document.pictureInPictureElement && document.pictureInPictureElement === videoEl);
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function renderDynamicIslandCanvas(state) {
  if (typeof document === 'undefined') return;
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) return;
  if (!canvasEl) {
    canvasEl = document.createElement('canvas');
    canvasEl.width = 760;
    canvasEl.height = 340;
    try {
      ctx2d = canvasEl.getContext('2d');
    } catch {
      ctx2d = null;
    }
  }
  if (!ctx2d || !state) return;

  const {
    status = 'idle',
    mode = 'focus',
    plannedSec = 1500,
    remainingSec = 1500,
    selectedTaskTitle = 'Fokus Umum',
    isRinging = false,
    theme = 'light',
  } = state;

  const isDone = status === 'completed' || isRinging;
  const progress = plannedSec > 0 ? Math.min(1, Math.max(0.04, (plannedSec - remainingSec) / plannedSec)) : 0.04;
  const accentColor = isDone ? '#68a377' : theme === 'monochrome' ? '#ffffff' : '#e88d48';

  const W = canvasEl.width;
  const H = canvasEl.height;
  ctx2d.clearRect(0, 0, W, H);

  const grad = ctx2d.createLinearGradient(0, 0, W, H);
  if (theme === 'monochrome') {
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
    grad.addColorStop(0.5, 'rgba(128, 128, 128, 0.38)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.65)');
  } else {
    grad.addColorStop(0, 'rgba(232, 141, 72, 0.9)');
    grad.addColorStop(0.5, 'rgba(107, 74, 46, 0.65)');
    grad.addColorStop(1, 'rgba(213, 196, 174, 0.9)');
  }

  drawRoundedRect(ctx2d, 4, 4, W - 8, H - 8, 52);
  ctx2d.fillStyle = grad;
  ctx2d.fill();

  drawRoundedRect(ctx2d, 8, 8, W - 16, H - 16, 48);
  ctx2d.fillStyle = theme === 'monochrome' ? '#0c0c0c' : '#13100e';
  ctx2d.fill();

  let headline = `Sedang fokus: ${selectedTaskTitle}`;
  if (isDone) {
    headline = mode === 'short_break' || mode === 'long_break' ? 'Waktu istirahat selesai!' : `Sesi selesai: ${selectedTaskTitle}`;
  } else if (status === 'paused') {
    headline = `Timer dijeda: ${selectedTaskTitle}`;
  } else if (mode === 'short_break') {
    headline = 'Istirahat singkat sedang berjalan...';
  } else if (mode === 'long_break') {
    headline = 'Istirahat panjang sedang berjalan...';
  }
  if (headline.length > 42) {
    headline = `${headline.slice(0, 40)}...`;
  }

  ctx2d.fillStyle = 'rgba(255, 255, 255, 0.82)';
  ctx2d.font = '500 24px "IBM Plex Sans", system-ui, sans-serif';
  ctx2d.textAlign = 'center';
  ctx2d.fillText(headline, W / 2, 56);

  ctx2d.textAlign = 'left';
  ctx2d.fillStyle = 'rgba(255, 255, 255, 0.65)';
  ctx2d.font = '500 24px "IBM Plex Sans", system-ui, sans-serif';
  const statusLabel = isDone ? 'Selesai' : status === 'paused' ? 'Dijeda' : 'Timer';
  ctx2d.fillText(statusLabel, 48, 172);

  const labelWidth = ctx2d.measureText(statusLabel).width;
  ctx2d.fillStyle = '#ffffff';
  ctx2d.font = '600 88px "IBM Plex Mono", monospace';
  ctx2d.fillText(formatSecondsClock(remainingSec), 48 + labelWidth + 20, 176);

  const cx = W - 104;
  const cy = 144;
  const radius = 50;

  ctx2d.beginPath();
  ctx2d.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx2d.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx2d.lineWidth = 9;
  ctx2d.stroke();

  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + Math.PI * 2 * (isDone ? 1 : progress);
  ctx2d.beginPath();
  ctx2d.arc(cx, cy, radius, startAngle, endAngle);
  ctx2d.strokeStyle = accentColor;
  ctx2d.lineWidth = 9;
  ctx2d.lineCap = 'round';
  ctx2d.stroke();

  ctx2d.beginPath();
  ctx2d.arc(cx, cy, 34, 0, Math.PI * 2);
  ctx2d.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx2d.fill();

  ctx2d.fillStyle = '#ffffff';
  drawRoundedRect(ctx2d, cx - 18, cy - 13, 18, 5.5, 2.5);
  ctx2d.fill();
  drawRoundedRect(ctx2d, cx - 12, cy - 3, 20, 5.5, 2.5);
  ctx2d.fill();
  drawRoundedRect(ctx2d, cx - 6, cy + 7, 13, 5.5, 2.5);
  ctx2d.fill();
  ctx2d.fillStyle = accentColor;
  drawRoundedRect(ctx2d, cx + 10, cy + 7, 6, 5.5, 2);
  ctx2d.fill();

  ctx2d.fillStyle = 'rgba(255, 255, 255, 0.14)';
  ctx2d.fillRect(48, 224, W - 96, 2);

  ctx2d.fillStyle = accentColor;
  ctx2d.beginPath();
  ctx2d.arc(62, 276, 8, 0, Math.PI * 2);
  ctx2d.fill();

  ctx2d.fillStyle = 'rgba(255, 255, 255, 0.88)';
  ctx2d.font = '600 23px "IBM Plex Sans", system-ui, sans-serif';
  ctx2d.textAlign = 'left';
  ctx2d.fillText(
    status === 'paused' ? 'Dijeda (Klik Play untuk lanjut)' : isDone ? 'Sesi Fokus Selesai' : 'TASKLY Focus Aktif',
    82,
    284
  );

  ctx2d.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx2d.font = '500 21px "IBM Plex Sans", system-ui, sans-serif';
  ctx2d.textAlign = 'right';
  ctx2d.fillText('Dynamic Focus', W - 48, 284);
}

function ensureVideoElement() {
  if (typeof document === 'undefined') return null;
  if (videoEl && document.body.contains(videoEl)) return videoEl;

  renderDynamicIslandCanvas(latestState || {});
  if (!canvasEl || typeof canvasEl.captureStream !== 'function') return null;

  videoEl = document.createElement('video');
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.setAttribute('playsinline', '');
  videoEl.setAttribute('muted', '');
  if ('autoPictureInPicture' in videoEl) {
    videoEl.autoPictureInPicture = true;
  }
  videoEl.style.position = 'fixed';
  videoEl.style.width = '1px';
  videoEl.style.height = '1px';
  videoEl.style.opacity = '0.001';
  videoEl.style.pointerEvents = 'none';
  videoEl.style.bottom = '0';
  videoEl.style.right = '0';
  videoEl.style.zIndex = '-1';

  try {
    streamObj = canvasEl.captureStream(10);
    videoEl.srcObject = streamObj;
  } catch {
    return null;
  }

  videoEl.addEventListener('enterpictureinpicture', () => notifyPipListeners(true));
  videoEl.addEventListener('leavepictureinpicture', () => {
    manualPipPinned = false;
    notifyPipListeners(false);
  });

  document.body.appendChild(videoEl);
  return videoEl;
}

function syncMediaSession(state) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !state) return;
  try {
    const active = state.status === 'running' || state.status === 'paused' || state.isRinging;
    if (!active) {
      navigator.mediaSession.playbackState = 'none';
      return;
    }
    if (typeof MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${formatSecondsClock(state.remainingSec)} • ${state.selectedTaskTitle || 'Fokus Umum'}`,
        artist: 'TASKLY Focus Mode',
        album: state.status === 'paused' ? 'Timer Dijeda' : 'Sedang Fokus',
      });
    }
    navigator.mediaSession.playbackState = state.status === 'running' ? 'playing' : 'paused';

    navigator.mediaSession.setActionHandler('play', () => {
      latestState?.onResume?.();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      latestState?.onPause?.();
    });
    navigator.mediaSession.setActionHandler('stop', () => {
      latestState?.onStop?.();
    });
    try {
      navigator.mediaSession.setActionHandler('enterpictureinpicture', () => {
        openFocusPipWindow();
      });
    } catch {
      // Not supported in all browsers
    }
  } catch {
    // Ignore MediaSession errors
  }
}

function syncBackgroundLiveNotification(state) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const isRunningOrPaused = state && (state.status === 'running' || state.status === 'paused');
  if (!isRunningOrPaused || document.visibilityState !== 'hidden') {
    lastNotifSec = -1;
    return;
  }

  // Throttle silent live notification updates when in background
  if (lastNotifSec !== -1 && Math.abs(lastNotifSec - state.remainingSec) < 5 && state.status === 'running') {
    return;
  }
  lastNotifSec = state.remainingSec;

  try {
    const title = `Timer ${formatSecondsClock(state.remainingSec)} • ${
      state.status === 'paused' ? 'Dijeda' : 'Fokus Aktif'
    }`;
    const body = `Sedang fokus: ${state.selectedTaskTitle || 'Fokus Umum'}`;
    const n = new Notification(title, {
      body,
      icon: '/icon-192.png',
      tag: 'taskly-focus-live',
      silent: true,
    });
    n.onclick = () => {
      window.focus?.();
      n.close();
    };
  } catch {
    // Ignore in environments that disallow direct Notification constructor
  }
}

export async function armFocusPipOnStart() {
  try {
    const vid = ensureVideoElement();
    if (!vid) return false;
    renderDynamicIslandCanvas(latestState || {});
    if (vid.paused) {
      await vid.play().catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

export async function openFocusPipWindow({ manual = false } = {}) {
  try {
    const vid = ensureVideoElement();
    if (!vid || typeof vid.requestPictureInPicture !== 'function') return false;
    renderDynamicIslandCanvas(latestState || {});
    if (vid.paused) {
      await vid.play().catch(() => {});
    }
    if (document.pictureInPictureElement !== vid) {
      await vid.requestPictureInPicture();
    }
    if (manual) manualPipPinned = true;
    notifyPipListeners(true);
    return true;
  } catch {
    return false;
  }
}

export async function closeFocusPipWindow() {
  try {
    manualPipPinned = false;
    if (typeof document !== 'undefined' && document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    }
    notifyPipListeners(false);
  } catch {
    // ignore
  }
}

export async function toggleFocusPipWindow() {
  if (isFocusPipActive()) {
    await closeFocusPipWindow();
    return false;
  }
  return openFocusPipWindow({ manual: true });
}

export function syncFocusPipState(state) {
  latestState = state;
  const active =
    state &&
    (state.status === 'running' || state.status === 'paused' || state.status === 'completed' || state.isRinging);

  if (!active) {
    closeFocusPipWindow();
    if (videoEl && !videoEl.paused) {
      try {
        videoEl.pause();
      } catch {
        // ignore
      }
    }
    return;
  }

  renderDynamicIslandCanvas(state);
  syncMediaSession(state);
  syncBackgroundLiveNotification(state);

  try {
    const track = streamObj?.getVideoTracks?.()[0];
    if (track && typeof track.requestFrame === 'function') {
      track.requestFrame();
    }
  } catch {
    // ignore
  }

  if (!pipListenersBound && typeof document !== 'undefined') {
    pipListenersBound = true;
    document.addEventListener('visibilitychange', () => {
      const st = latestState;
      const isRunning = st && (st.status === 'running' || st.status === 'paused');
      if (document.visibilityState === 'hidden' && isRunning) {
        syncBackgroundLiveNotification(st);
        openFocusPipWindow({ manual: false }).catch(() => {});
      } else if (document.visibilityState === 'visible' && !manualPipPinned && isFocusPipActive()) {
        closeFocusPipWindow().catch(() => {});
      }
    });
  }
}
