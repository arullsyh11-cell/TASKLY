export function TasklyLogo({ variant = 'lockup', size = 'md', className = '' }) {
  const iconDim = size === 'sm' ? 24 : size === 'lg' ? 36 : 28;
  const textSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-xl' : 'text-lg';

  return (
    <span className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <svg
        width={iconDim}
        height={iconDim}
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect x="4" y="12" width="32" height="10" rx="4" fill="var(--color-text-primary)" />
        <rect x="14" y="27" width="36" height="10" rx="4" fill="var(--color-text-primary)" />
        <rect x="24" y="42" width="22" height="10" rx="4" fill="var(--color-text-primary)" />
        <rect x="50" y="42" width="10" height="10" rx="3.5" fill="var(--color-primary)" />
      </svg>
      {variant === 'lockup' && (
        <span
          className={`font-bold tracking-tight text-[var(--color-text-primary)] ${textSize}`}
          style={{ letterSpacing: '-0.02em' }}
        >
          TASKLY
        </span>
      )}
    </span>
  );
}
