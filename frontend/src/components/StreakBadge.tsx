import { PauseCircle } from "lucide-react";
import { Icon } from "./Icon";
import { StreakFlame } from "./StreakFlame";

// Consolidates two previously-separate, independently-maintained streak visuals
// (Routines.tsx's pill badge, Insights.tsx's plain inline text) into one component.
export function StreakBadge({
  days,
  unit = "day",
  compact = false,
  variant = "badge",
  paused = false,
}: {
  days: number;
  unit?: string;
  /** Compact form concatenates with no space/pluralization, e.g. "5d" instead of "5 days". */
  compact?: boolean;
  variant?: "badge" | "inline";
  /** Today's day was a forgiven Skipped/N-A — the streak is held, not broken. Icon + label,
   * never color alone, per DESIGN.md. Only shown alongside an existing streak (days > 0) —
   * there's nothing to protect at zero. */
  paused?: boolean;
}) {
  if (days <= 0) return null;
  const label = compact ? `${days}${unit}` : `${days} ${unit}${days === 1 ? "" : "s"}`;

  const pausedNote = paused && (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-ink dark:text-slate-ink-dark">
      <Icon icon={PauseCircle} size={12} />
      Streak paused today
    </span>
  );

  if (variant === "inline") {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 font-medium tabular-nums text-amber-ink dark:text-amber-ink-dark">
          <StreakFlame size={13} className="text-amber" />
          {label}
        </span>
        {pausedNote}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-soft px-2 py-0.5 text-xs font-medium tabular-nums text-amber-ink dark:bg-amber-soft-dark dark:text-amber-ink-dark">
        <StreakFlame size={12} className="text-amber" />
        {label}
      </span>
      {pausedNote}
    </span>
  );
}
