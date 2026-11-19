import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CalendarClock, Check, CheckCheck, Plus, Settings, Timer, X } from 'lucide-react';
import { useReminders } from './useReminders.js';
import { useReminderStore } from '../../stores/useReminderStore.js';
import { useUiStore } from '../../stores/useUiStore.js';
import { useTimerStore } from '../../stores/useTimerStore.js';
import { Button } from '../../components/ui/Button.jsx';
import { ReminderTag } from '../../components/ui/Badge.jsx';
import { formatDateId } from '../../utils/dateUtils.js';

export function ReminderBellMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const navigate = useNavigate();

  const { dueNow, scheduled, unreadCount, reminderEnabled } = useReminders();
  const acknowledged = useReminderStore((s) => s.acknowledged);
  const markAcknowledged = useReminderStore((s) => s.markAcknowledged);
  const markAllAcknowledged = useReminderStore((s) => s.markAllAcknowledged);
  const openTaskDrawer = useUiStore((s) => s.openTaskDrawer);
  const openQuickAdd = useUiStore((s) => s.openQuickAdd);
  const selectTimerTask = useTimerStore((s) => s.selectTask);

  useEffect(() => {
    if (!open) return;
    function onOutside(e) {
      if (!containerRef.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus?.();
      }
    }
    document.addEventListener('mousedown', onOutside);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function handleOpenTask(entry) {
    markAcknowledged(entry.signature);
    setOpen(false);
    openTaskDrawer(entry.task.id);
  }

  function handleLaunchFocus(entry) {
    markAcknowledged(entry.signature);
    selectTimerTask(entry.task.id, entry.task.title);
    setOpen(false);
    navigate('/focus');
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          unreadCount > 0
            ? `Pengingat deadline (${unreadCount} belum dibaca)`
            : 'Pengingat deadline'
        }
        title="Pengingat Deadline"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] transition-colors active:scale-95 hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)] after:absolute after:-inset-0.5 after:content-['']"
      >
        <Bell className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--color-primary)] px-1 font-mono-num text-[10px] font-bold text-[var(--color-on-primary)]"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Pusat pengingat deadline"
          className="fixed left-3 right-3 top-[calc(4.4rem+env(safe-area-inset-top))] z-50 sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-[400px] rounded-[var(--radius-lg)] border border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] p-4"
          style={{ boxShadow: 'var(--shadow-overlay)' }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] pb-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Pengingat Deadline</h2>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                {reminderEnabled
                  ? `${dueNow.length} pengingat aktif hari ini, ${scheduled.length} terjadwal`
                  : 'Pengingat otomatis sedang dinonaktifkan'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAllAcknowledged(dueNow.map((d) => d.signature))}
                  title="Tandai semua sudah dibaca"
                  aria-label="Tandai semua pengingat sudah dibaca"
                  className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-[11px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                >
                  <CheckCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  <span className="hidden sm:inline">Baca Semua</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate('/settings?tab=focus');
                }}
                aria-label="Atur default hari pengingat"
                title="Pengaturan Pengingat"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]"
              >
                <Settings className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Tutup panel pengingat"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]"
              >
                <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="mt-3 max-h-[62dvh] space-y-4 overflow-y-auto pr-0.5">
            {dueNow.length === 0 && scheduled.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2.5 py-6 text-center">
                <CalendarClock className="h-7 w-7 text-[var(--color-text-muted)]" strokeWidth={1.5} aria-hidden="true" />
                <div>
                  <p className="text-xs font-semibold text-[var(--color-text-primary)]">
                    Belum ada pengingat deadline aktif
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--color-text-secondary)]">
                    Tambahkan tenggat waktu pada tugas untuk menerima pengingat otomatis H-1 atau sesuai hari pilihan Anda.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setOpen(false);
                    openQuickAdd();
                  }}
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  <span>Tambah Tugas</span>
                </Button>
              </div>
            ) : (
              <>
                {dueNow.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-accent-text)]">
                      Perlu Perhatian Sekarang ({dueNow.length})
                    </p>
                    <ul className="space-y-2">
                      {dueNow.map((entry) => {
                        const isRead = Boolean(acknowledged[entry.signature]);
                        return (
                          <li
                            key={entry.task.id}
                            className={`rounded-[var(--radius-md)] border p-3 transition-colors ${
                              isRead
                                ? 'border-[var(--color-border)] bg-[var(--color-bg)]'
                                : 'border-[var(--color-border-warm)] bg-[var(--color-surface-warm)]/60'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <ReminderTag label={entry.badgeLabel} active={!isRead} />
                                <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">
                                  {entry.title}
                                </span>
                              </div>
                              {!isRead && (
                                <button
                                  type="button"
                                  onClick={() => markAcknowledged(entry.signature)}
                                  aria-label={`Tandai dibaca: ${entry.task.title}`}
                                  title="Tandai sudah dibaca"
                                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-primary)]"
                                >
                                  <Check className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                                </button>
                              )}
                            </div>

                            <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-text-primary)]">
                              {entry.message}
                            </p>

                            <div className="mt-2.5 flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenTask(entry)}
                                className="inline-flex min-h-[32px] items-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-xs font-medium text-[var(--color-text-primary)] hover:border-[var(--color-primary)]"
                              >
                                Buka Tugas
                              </button>
                              <button
                                type="button"
                                onClick={() => handleLaunchFocus(entry)}
                                className="inline-flex min-h-[32px] items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                              >
                                <Timer className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                                <span>Fokus</span>
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {scheduled.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                      Terjadwal Berikutnya ({scheduled.length})
                    </p>
                    <ul className="space-y-1.5">
                      {scheduled.slice(0, 6).map((entry) => (
                        <li
                          key={entry.task.id}
                          className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
                        >
                          <button
                            type="button"
                            onClick={() => handleOpenTask(entry)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="truncate text-xs font-medium text-[var(--color-text-primary)]">
                              {entry.task.title}
                            </p>
                            <p className="text-[11px] text-[var(--color-text-muted)]">
                              Diingatkan {formatDateId(entry.reminderDateIso, 'd MMM yyyy')} (deadline {formatDateId(entry.task.due_date, 'd MMM')})
                            </p>
                          </button>
                          <ReminderTag label={entry.badgeLabel} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
