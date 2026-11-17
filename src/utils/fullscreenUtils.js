export function getFullscreenElement() {
  if (typeof document === 'undefined') return null;
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

export function isStandalonePwa() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.matchMedia?.('(display-mode: fullscreen)')?.matches ||
    window.navigator?.standalone === true
  );
}

export function canUseNativeFullscreen() {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement;
  return Boolean(
    (document.fullscreenEnabled ?? true) &&
      (typeof el?.requestFullscreen === 'function' || typeof el?.webkitRequestFullscreen === 'function')
  );
}

export async function enterNativeFullscreen() {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement;
  try {
    if (typeof el.requestFullscreen === 'function') {
      await el.requestFullscreen({ navigationUI: 'hide' });
      return true;
    }
    if (typeof el.webkitRequestFullscreen === 'function') {
      await el.webkitRequestFullscreen();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function exitNativeFullscreen() {
  if (typeof document === 'undefined') return false;
  try {
    if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
      await document.exitFullscreen();
      return true;
    }
    if (document.webkitFullscreenElement && typeof document.webkitExitFullscreen === 'function') {
      await document.webkitExitFullscreen();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function toggleNativeFullscreen() {
  if (getFullscreenElement()) {
    await exitNativeFullscreen();
    return { supported: true, active: false };
  }
  const entered = await enterNativeFullscreen();
  return { supported: entered, active: entered };
}
