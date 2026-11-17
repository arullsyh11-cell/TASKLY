import { create } from 'zustand';
import { repo } from '../services/repositories/index.js';
import { useUiStore } from './useUiStore.js';

export const useAuthStore = create((set) => ({
  user: repo.mode === 'local' ? { id: 'local-user', full_name: 'Pengguna', mode: 'local' } : null,
  isBootstrapping: repo.mode !== 'local',

  async bootstrap() {
    if (repo.mode === 'local') {
      try {
        const { user, settings } = await repo.auth.me();
        if (settings?.theme) {
          useUiStore.getState().setTheme(settings.theme);
        }
        set({ user, isBootstrapping: false });
      } catch {
        set({ user: { id: 'local-user', full_name: 'Pengguna', mode: 'local' }, isBootstrapping: false });
      }
      return;
    }

    const token = repo.auth.getToken();
    if (!token) {
      set({ user: null, isBootstrapping: false });
      return;
    }
    try {
      const { user, settings } = await repo.auth.me();
      if (settings?.theme) {
        useUiStore.getState().setTheme(settings.theme);
      }
      set({ user, isBootstrapping: false });
    } catch {
      await repo.auth.logout();
      set({ user: null, isBootstrapping: false });
    }
  },

  async login(credentials) {
    const data = await repo.auth.login(credentials);
    set({ user: data.user });
    return data.user;
  },

  async register(payload) {
    const data = await repo.auth.register(payload);
    set({ user: data.user });
    return data.user;
  },

  setUser(user) {
    set({ user });
  },

  async logout() {
    await repo.auth.logout();
    set({ user: null });
  },
}));
