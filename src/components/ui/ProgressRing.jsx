export function ProgressRing({
  percent = 0,
  size = 52,
  stroke = 5,
  color = 'var(--color-primary)',
  centerLabel,
  icon: Icon,
}) {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono-num text-[11px] font-semibold text-[var(--color-text-primary)]">
        {Icon ? <Icon className="h-4 w-4 text-[var(--color-accent-text)]" strokeWidth={1.75} /> : centerLabel ?? `${clamped}%`}
      </span>
    </div>
  );
}
