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

export const useUiStore = create((set, get) => ({
  theme: getInitialTheme(),
  sidebarCollapsed: getInitialCollapsed(),
  mobileNavOpen: false,
  activeTaskId: null,
  quickAddOpen: false,
  quickAddDefaults: {},

  setTheme(nextTheme) {
    const val = nextTheme === 'monochrome' ? 'monochrome' : 'light';
    document.documentElement.setAttribute('data-theme', val);
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
