// A generic circular progress indicator for Phase 3's Dashboard rings (routines,
// medications, hydration/activity). Tasks.tsx's DeadlineRing keeps its own urgency-color
// logic (it answers a different question — "how urgent," not "how much done") rather
// than being rebuilt on top of this.
export function ProgressRing({
  fraction,
  size = 48,
  stroke = 5,
  colorClassName = "stroke-bloom",
  trackClassName = "stroke-stone dark:stroke-stone-dark",
  label,
}: {
  /** 0-1 */
  fraction: number;
  size?: number;
  stroke?: number;
  colorClassName?: string;
  trackClassName?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? `${Math.round(clamped * 100)}% complete`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className={trackClassName} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={`${colorClassName} transition-[stroke-dashoffset]`}
          style={{ transitionDuration: "var(--duration-base)" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs font-medium tabular-nums text-ink dark:text-paper">
        {Math.round(clamped * 100)}%
      </div>
    </div>
  );
}
