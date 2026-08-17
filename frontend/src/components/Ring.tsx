const SIZE = 44;
const STROKE = 5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export type RingTrend = "up" | "down" | "flat";

const TREND_GLYPH: Record<RingTrend, string> = { up: "↑", down: "↓", flat: "–" };
const TREND_COLOR: Record<RingTrend, string> = {
  up: "text-sage",
  down: "text-terracotta",
  flat: "text-ink-muted dark:text-fog-muted",
};

export default function Ring({
  value,
  target,
  label,
  displayValue,
  sublabel,
  trend,
  streakDays,
}: {
  value: number;
  target: number;
  label: string;
  displayValue: string;
  sublabel?: string;
  trend?: RingTrend;
  streakDays?: number;
}) {
  const progress = target > 0 ? Math.min(value / target, 1) : 0;
  const offset = CIRCUMFERENCE * (1 - progress);
  const progressColorClass =
    progress >= 0.67 ? "stroke-sage" : progress >= 0.34 ? "stroke-[#C79233]" : "stroke-terracotta";
  const percent = Math.round(progress * 100);

  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={`${label}: ${displayValue}, ${percent}% of goal`}
        >
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
            className={`${progressColorClass} transition-[stroke-dashoffset,stroke] duration-500`}
          />
        </svg>
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-ink-muted dark:text-fog-muted"
        >
          {percent}%
        </span>
      </div>
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted dark:text-fog-muted">
          {label}
          {Boolean(streakDays && streakDays >= 2) && (
            <span
              className="rounded-full bg-sage-soft px-1.5 py-px normal-case tracking-normal text-sage dark:bg-sage-soft-dark dark:text-sage-light"
              title={`${streakDays}-day streak`}
            >
              {streakDays}d
            </span>
          )}
        </p>
        <p className="truncate text-base font-semibold tracking-tight text-ink dark:text-cream">
          {displayValue}
        </p>
        <div className="flex items-center gap-1.5">
          {sublabel && (
            <p className="truncate text-[11px] text-ink-muted dark:text-fog-muted">{sublabel}</p>
          )}
          {trend && (
            <span
              className={`text-[11px] font-medium ${TREND_COLOR[trend]}`}
              aria-label={`${trend === "up" ? "Higher" : trend === "down" ? "Lower" : "Same"} than yesterday`}
            >
              <span aria-hidden="true">{TREND_GLYPH[trend]}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
