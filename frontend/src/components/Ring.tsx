const SIZE = 64;
const STROKE = 6;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function Ring({
  value,
  target,
  label,
  displayValue,
  sublabel,
}: {
  value: number;
  target: number;
  label: string;
  displayValue: string;
  sublabel?: string;
}) {
  const progress = target > 0 ? Math.min(value / target, 1) : 0;
  const offset = CIRCUMFERENCE * (1 - progress);

  return (
    <div className="flex items-center gap-3">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="shrink-0">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-stone dark:stroke-stone-dark"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          className="stroke-sage transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted dark:text-fog-muted">
          {label}
        </p>
        <p className="text-lg font-medium text-ink dark:text-cream">{displayValue}</p>
        {sublabel && <p className="text-xs text-ink-muted dark:text-fog-muted">{sublabel}</p>}
      </div>
    </div>
  );
}
