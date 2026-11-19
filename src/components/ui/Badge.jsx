import { AlertCircle, ArrowDown, ArrowUp, Bell, CheckCircle2, Flame, Minus } from 'lucide-react';

const PRIORITY_META = {
  urgent: {
    label: 'Urgent',
    icon: Flame,
    cls: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)] border-[var(--color-danger)]/30',
  },
  high: {
    label: 'High',
    icon: ArrowUp,
    cls: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-[var(--color-warning)]/30',
  },
  medium: {
    label: 'Medium',
    icon: Minus,
    cls: 'bg-[var(--color-secondary)] text-[var(--color-on-secondary)] border-[var(--color-border-warm)]/40',
  },
  low: {
    label: 'Low',
    icon: ArrowDown,
    cls: 'bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] border-[var(--color-border)]',
  },
};

const TONE_MAP = {
  accent: 'bg-[var(--color-surface-warm)] text-[var(--color-accent-text)] border-[var(--color-border-warm)]/50',
  secondary: 'bg-[var(--color-secondary)] text-[var(--color-on-secondary)] border-[var(--color-border)]',
  success: 'bg-[var(--color-success-bg)] text-[var(--color-success)] border-[var(--color-success)]/30',
  warning: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-[var(--color-warning)]/30',
  danger: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)] border-[var(--color-danger)]/30',
  neutral: 'bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] border-[var(--color-border)]',
};

export function PriorityBadge({ priority }) {
  const meta = PRIORITY_META[priority] || PRIORITY_META.medium;
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-2 py-0.5 text-xs font-medium ${meta.cls}`}
    >
      <Icon className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span>{meta.label}</span>
    </span>
  );
}

export function StatusBadge({ tone = 'neutral', children, showCheck = false }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-2 py-0.5 text-xs font-medium ${TONE_MAP[tone] || TONE_MAP.neutral}`}
    >
      {showCheck && <CheckCircle2 className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />}
      <span>{children}</span>
    </span>
  );
}

export function OverdueTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-bg)] px-2 py-0.5 text-xs font-medium text-[var(--color-danger)]">
      <AlertCircle className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span>Terlambat</span>
    </span>
  );
}

export function ReminderTag({ label, active = false }) {
  if (!label) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-2 py-0.5 text-xs font-medium ${
        active
          ? 'border-[var(--color-warning)]/40 bg-[var(--color-warning-bg)] text-[var(--color-warning)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]'
      }`}
    >
      <Bell className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
