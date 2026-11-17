import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary:
    'bg-[var(--color-primary)] text-[var(--color-on-primary)] hover:bg-[var(--color-primary-hover)] border border-transparent font-semibold',
  secondary:
    'bg-[var(--color-secondary)] text-[var(--color-on-secondary)] hover:bg-[var(--color-secondary-hover)] border border-[var(--color-border-warm)] font-medium',
  outline:
    'bg-transparent text-[var(--color-text-primary)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface)] font-medium',
  ghost:
    'bg-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] border border-transparent font-medium',
  danger:
    'bg-[var(--color-danger)] text-white hover:opacity-90 border border-transparent font-semibold',
};

const SIZES = {
  sm: 'h-9 px-3 text-xs rounded-[var(--radius-sm)]',
  md: 'h-10 px-4 text-sm rounded-[var(--radius-sm)]',
  lg: 'h-11 px-5 text-sm rounded-[var(--radius-sm)]',
  icon: 'h-11 w-11 md:h-9 md:w-9 p-0 rounded-[var(--radius-sm)]',
};

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', isLoading = false, disabled = false, type = 'button', className = '', children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center gap-2 transition-colors duration-[var(--duration-fast)] active:scale-[0.99] disabled:opacity-50 ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`}
      {...props}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden="true" />}
      {children}
    </button>
  );
});
