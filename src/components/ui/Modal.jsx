import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

let bodyLockCount = 0;
let previousBodyOverflow = '';

export function acquireBodyScrollLock() {
  if (typeof document === 'undefined') return () => {};
  if (bodyLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  bodyLockCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    bodyLockCount = Math.max(0, bodyLockCount - 1);
    if (bodyLockCount === 0) {
      document.body.style.overflow = previousBodyOverflow;
    }
  };
}

export function Modal({ open, onClose, title, subtitle, maxWidth = 'max-w-lg', children }) {
  const panelRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    return acquireBodyScrollLock();
  }, [open]);

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      const timer = setTimeout(() => {
        const focusable = panelRef.current?.querySelector(
          'input, select, textarea, button:not([data-close-modal]), [tabindex]:not([tabindex="-1"])'
        );
        (focusable || panelRef.current)?.focus();
      }, 10);
      return () => clearTimeout(timer);
    }
    if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 p-0 sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`w-full ${maxWidth} max-h-[92dvh] overflow-y-auto rounded-t-[var(--radius-lg)] sm:rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]`}
        style={{ boxShadow: 'var(--shadow-overlay)' }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">{subtitle}</p>}
          </div>
          <button
            type="button"
            data-close-modal="true"
            onClick={onClose}
            aria-label="Tutup dialog"
            className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <div className="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, subtitle, children }) {
  const panelRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    return acquireBodyScrollLock();
  }, [open]);

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      const timer = setTimeout(() => {
        panelRef.current?.focus();
      }, 10);
      return () => clearTimeout(timer);
    }
    if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="flex h-full w-full max-w-xl flex-col border-l border-[var(--color-border)] bg-[var(--color-surface-elevated)] pt-[env(safe-area-inset-top)] text-[var(--color-text-primary)]"
        style={{ boxShadow: 'var(--shadow-overlay)' }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4 shrink-0">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-[var(--color-text-primary)]">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panel detail"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}
