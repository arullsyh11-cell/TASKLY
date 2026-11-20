import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from './Button.jsx';

export function LoadingState({ label = 'Loading data...', rows = 3 }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <p className="text-xs font-medium text-[var(--color-text-secondary)]">{label}</p>
      <div className="space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-10 w-full animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)]"
          />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, secondaryAction }) {
  return (
    <div className="flex flex-col items-start justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6 sm:p-8">
      {Icon && (
        <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-accent-text)]">
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </div>
      )}
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-[var(--color-text-secondary)]">{description}</p>
      {(action || secondaryAction) && (
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

export function ErrorState({ title = 'Failed to load data', message, onRetry }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-danger)]/40 bg-[var(--color-danger-bg)] p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-danger)]" strokeWidth={1.75} aria-hidden="true" />
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
          <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
            {message || 'Something went wrong while fetching data from the server.'}
          </p>
        </div>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0 bg-[var(--color-surface)]">
          <RotateCw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          <span>Try Again</span>
        </Button>
      )}
    </div>
  );
}
