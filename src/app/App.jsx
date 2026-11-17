import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AppRouter } from './router.jsx';
import { useAuthStore } from '../stores/useAuthStore.js';
import { useUiStore } from '../stores/useUiStore.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
  },
});

export function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    const color = theme === 'monochrome' ? '#0b0b0b' : '#ffffff';
    document.getElementById('taskly-theme-color')?.setAttribute('content', color);
    document
      .getElementById('taskly-apple-status')
      ?.setAttribute('content', theme === 'monochrome' ? 'black-translucent' : 'default');
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
      <Toaster
        theme={theme === 'monochrome' ? 'dark' : 'light'}
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--color-surface-elevated)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
          },
        }}
      />
    </QueryClientProvider>
  );
}
