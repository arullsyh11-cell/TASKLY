import { forwardRef, useId } from 'react';

const baseFieldClass =
  'w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-base sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-primary)] disabled:opacity-50';

export const Input = forwardRef(function Input({ label, error, id, className = '', hint, ...props }, ref) {
  const autoId = useId();
  const fieldId = id || autoId;
  const errId = `${fieldId}-err`;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={fieldId} className="text-xs font-medium text-[var(--color-text-secondary)]">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errId : undefined}
        className={`min-h-[42px] ${baseFieldClass} ${error ? 'border-[var(--color-danger)]' : ''} ${className}`}
        {...props}
      />
      {hint && !error && <p className="text-xs text-[var(--color-text-muted)]">{hint}</p>}
      {error && (
        <p id={errId} role="alert" className="text-xs font-medium text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  );
});

export const Textarea = forwardRef(function Textarea({ label, error, id, className = '', rows = 3, ...props }, ref) {
  const autoId = useId();
  const fieldId = id || autoId;
  const errId = `${fieldId}-err`;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={fieldId} className="text-xs font-medium text-[var(--color-text-secondary)]">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errId : undefined}
        className={`${baseFieldClass} ${error ? 'border-[var(--color-danger)]' : ''} ${className}`}
        {...props}
      />
      {error && (
        <p id={errId} role="alert" className="text-xs font-medium text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  );
});
