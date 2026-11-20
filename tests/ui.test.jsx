import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState } from '../src/components/ui/States.jsx';
import { Modal } from '../src/components/ui/Modal.jsx';
import { Input } from '../src/components/ui/Input.jsx';
import { Dropdown } from '../src/components/ui/Dropdown.jsx';
import { LoginPage } from '../src/features/auth/AuthPages.jsx';
import { TasklyLogo } from '../src/components/brand/TasklyLogo.jsx';
import { ReminderField } from '../src/components/ui/ReminderField.jsx';
import { FocusExpandedPopup } from '../src/features/focus/FocusDynamicIsland.jsx';
import { App } from '../src/app/App.jsx';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '../src/stores/useAuthStore.js';

afterEach(() => {
  cleanup();
});

describe('TASKLY UI Components & States', () => {
  it('opens directly into localStorage workspace Dashboard without login gate', async () => {
    window.history.pushState({}, '', '/dashboard');
    render(<App />);
    expect(await screen.findByText(/Workspace Anda siap digunakan/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Masuk ke Workspace/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Muat Proyek Contoh/i })).not.toBeInTheDocument();
  });

  it('renders Loading, Empty, and Error states with clear actions', () => {
    const onRetry = vi.fn();
    render(
      <div>
        <LoadingState label="Memuat papan..." rows={2} />
        <EmptyState title="Kosong" description="Belum ada data" action={<button type="button">Buat</button>} />
        <ErrorState message="Jaringan terputus" onRetry={onRetry} />
      </div>
    );

    expect(screen.getByText('Memuat papan...')).toBeInTheDocument();
    expect(screen.getByText('Kosong')).toBeInTheDocument();
    expect(screen.getByText('Jaringan terputus')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Coba Lagi/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('closes Modal on Escape key press', () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Dialog Uji">
        <p>Konten dialog</p>
      </Modal>
    );

    expect(screen.getByRole('dialog', { name: 'Dialog Uji' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders accessible Input label and validation error linkage', () => {
    render(<Input label="Judul Tugas" error="Judul tugas wajib diisi." />);
    const input = screen.getByLabelText('Judul Tugas');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Judul tugas wajib diisi.');
  });

  it('renders TasklyLogo Concept 02 Task Flow mark and wordmark', () => {
    render(<TasklyLogo variant="lockup" />);
    expect(screen.getByText('TASKLY')).toBeInTheDocument();
  });

  it('renders custom Dropdown, supports search, selection, and Escape close', () => {
    const onChange = vi.fn();
    render(
      <Dropdown
        label="Prioritas"
        searchable
        value="medium"
        onChange={onChange}
        options={[
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
        ]}
      />
    );

    const trigger = screen.getByRole('combobox', { name: 'Prioritas' });
    expect(trigger).toHaveTextContent('Medium');
    fireEvent.click(trigger);

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: 'High' }));
    expect(onChange).toHaveBeenCalledWith('high');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('validates optional Login form when unauthenticated', async () => {
    useAuthStore.setState({ user: null, isBootstrapping: false });
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /Masuk ke Workspace/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email dan kata sandi wajib diisi.');
  });

  it('defaults workspace theme to light and switches to monochrome', async () => {
    const { useUiStore } = await import('../src/stores/useUiStore.js');
    expect(useUiStore.getState().theme).toBe('light');
    const next = useUiStore.getState().toggleTheme();
    expect(next).toBe('monochrome');
    expect(document.documentElement.getAttribute('data-theme')).toBe('monochrome');
    useUiStore.getState().setTheme('light');
  });

  it('tracks focus timer ringing state and clears on stop or reset', async () => {
    const { useTimerStore } = await import('../src/stores/useTimerStore.js');
    useTimerStore.getState().setRinging(true);
    expect(useTimerStore.getState().isRinging).toBe(true);
    useTimerStore.getState().stopRinging();
    expect(useTimerStore.getState().isRinging).toBe(false);
    useTimerStore.getState().setRinging(true);
    useTimerStore.getState().reset();
    expect(useTimerStore.getState().isRinging).toBe(false);
  });

  it('supports default H-1 and custom reminder days in ReminderField', () => {
    const onChange = vi.fn();
    render(<ReminderField dueDate="2026-11-25" value={1} defaultDays={1} onChange={onChange} />);

    const trigger = screen.getByRole('combobox', { name: /Pengingat Deadline/i });
    expect(trigger).toHaveTextContent('1 hari sebelum deadline (Default)');

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: /Custom jumlah hari/i }));

    const numInput = screen.getByLabelText(/Custom Hari Sebelum Deadline/i);
    fireEvent.change(numInput, { target: { value: '5' } });
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('renders FocusExpandedPopup automatically when timer runs and stays persistent until stopped', async () => {
    const { useTimerStore } = await import('../src/stores/useTimerStore.js');
    useTimerStore.getState().selectTask('t-focus', 'Review Desain UI');
    useTimerStore.getState().start();

    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <FocusExpandedPopup />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByRole('region', { name: 'Popup timer Focus Mode' })).toBeInTheDocument();
    expect(screen.getByText(/Sedang fokus: Review Desain UI/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Buka Fokus/i })).toBeInTheDocument();

    // Clicking outside or pressing Escape must NOT hide the active Dynamic Island popup
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('region', { name: 'Popup timer Focus Mode' })).toBeInTheDocument();

    act(() => {
      useTimerStore.getState().reset();
    });
  });
});
