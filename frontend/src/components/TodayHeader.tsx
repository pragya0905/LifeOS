import { StreakFlame } from "./StreakFlame";

function encouragement(done: number, total: number): string {
  if (total === 0) return "Nothing on the books";
  const ratio = done / total;
  if (ratio >= 1) return "all done — great work";
  if (ratio === 0) return "let's get started";
  if (ratio < 0.5) return "nice start";
  if (ratio < 1) return "more than halfway";
  return "";
}

// The streak pill is deliberately the larger, warmer Variant-A treatment (not B's compact
// "4d" text) — it's meant to read as encouraging, not as one more small stat.
export function TodayHeader({ streakDays, done, total }: { streakDays: number; done: number; total: number }) {
  const ratio = total > 0 ? Math.min(done / total, 1) : 0;

  return (
    <div className="flex flex-col gap-2.5">
      {streakDays > 0 && (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-soft px-3 py-1 text-sm font-semibold text-amber-ink dark:bg-amber-soft-dark dark:text-amber-ink-dark">
          <StreakFlame size={15} className="text-amber" />
          {streakDays} day streak
        </span>
      )}
      <div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-stone dark:bg-stone-dark">
          <div
            className="h-full rounded-full bg-bloom transition-[width]"
            style={{ width: `${ratio * 100}%`, transitionDuration: "var(--duration-base)" }}
          />
        </div>
        <p className="mt-1.5 text-xs tabular-nums text-ink-muted dark:text-mist-muted">
          {done} of {total} done today{encouragement(done, total) && ` — ${encouragement(done, total)}`}
        </p>
      </div>
    </div>
  );
}
