import { localStorageAdapter } from './localStorageAdapter.js';
import { apiAdapter } from './apiAdapter.js';
import { isSupabaseConfigured, supabaseAdapter } from './supabaseAdapter.js';

const useBackendApi = import.meta.env.VITE_USE_API === 'true';

export const repo = isSupabaseConfigured
  ? supabaseAdapter
  : useBackendApi
  ? apiAdapter
  : localStorageAdapter;
