import { StreakFlame } from "./StreakFlame";

// Consolidates two previously-separate, independently-maintained streak visuals
// (Routines.tsx's pill badge, Insights.tsx's plain inline text) into one component.
export function StreakBadge({
  days,
  unit = "day",
  compact = false,
  variant = "badge",
}: {
  days: number;
  unit?: string;
  /** Compact form concatenates with no space/pluralization, e.g. "5d" instead of "5 days". */
  compact?: boolean;
  variant?: "badge" | "inline";
}) {
  if (days <= 0) return null;
  const label = compact ? `${days}${unit}` : `${days} ${unit}${days === 1 ? "" : "s"}`;

  if (variant === "inline") {
    return (
      <span className="inline-flex items-center gap-1 font-medium tabular-nums text-amber-ink dark:text-amber-ink-dark">
        <StreakFlame size={13} className="text-amber" />
        {label}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-soft px-2 py-0.5 text-xs font-medium tabular-nums text-amber-ink dark:bg-amber-soft-dark dark:text-amber-ink-dark">
      <StreakFlame size={12} className="text-amber" />
      {label}
    </span>
  );
}
