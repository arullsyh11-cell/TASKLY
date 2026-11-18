import { create } from 'zustand';

function getInitialTheme() {
  try {
    const saved = localStorage.getItem('taskly_theme');
    if (saved === 'light' || saved === 'monochrome') return saved;
  } catch {
    // ignore
  }
  return 'light';
}

function getInitialCollapsed() {
  try {
    return localStorage.getItem('taskly_sidebar_collapsed') === 'true';
  } catch {
    return false;
  }
}

function getInitialNavStyle() {
  try {
    const saved = localStorage.getItem('taskly_nav_style');
    if (saved === 'radial' || saved === 'sidebar') return saved;
  } catch {
    // ignore
  }
  return 'radial';
}

function syncThemeMetaTags(val) {
  try {
    const color = val === 'monochrome' ? '#0b0b0b' : '#ffffff';
    document.getElementById('taskly-theme-color')?.setAttribute('content', color);
    document
      .getElementById('taskly-apple-status')
      ?.setAttribute('content', val === 'monochrome' ? 'black-translucent' : 'default');
  } catch {
    // ignore in non-browser contexts
  }
}

export const useUiStore = create((set, get) => ({
  theme: getInitialTheme(),
  navStyle: getInitialNavStyle(),
  sidebarCollapsed: getInitialCollapsed(),
  mobileNavOpen: false,
  activeTaskId: null,
  quickAddOpen: false,
  quickAddDefaults: {},

  setNavStyle(nextStyle) {
    const val = nextStyle === 'sidebar' ? 'sidebar' : 'radial';
    try {
      localStorage.setItem('taskly_nav_style', val);
    } catch {
      // ignore
    }
    set({ navStyle: val, mobileNavOpen: false });
  },

  setTheme(nextTheme) {
    const val = nextTheme === 'monochrome' ? 'monochrome' : 'light';
    document.documentElement.setAttribute('data-theme', val);
    syncThemeMetaTags(val);
    try {
      localStorage.setItem('taskly_theme', val);
    } catch {
      // ignore
    }
    set({ theme: val });
  },

  toggleTheme() {
    const next = get().theme === 'light' ? 'monochrome' : 'light';
    get().setTheme(next);
    return next;
  },

  toggleSidebar() {
    const next = !get().sidebarCollapsed;
    try {
      localStorage.setItem('taskly_sidebar_collapsed', String(next));
    } catch {
      // ignore
    }
    set({ sidebarCollapsed: next });
  },

  setMobileNavOpen(open) {
    set({ mobileNavOpen: Boolean(open) });
  },

  openTaskDrawer(taskId) {
    set({ activeTaskId: taskId });
  },

  closeTaskDrawer() {
    set({ activeTaskId: null });
  },

  openQuickAdd(defaults = {}) {
    set({ quickAddOpen: true, quickAddDefaults: defaults });
  },

  closeQuickAdd() {
    set({ quickAddOpen: false, quickAddDefaults: {} });
  },
}));
