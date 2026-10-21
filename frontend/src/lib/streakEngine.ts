// Forgiving streaks: a Skipped (or, for routine steps, Not-Applicable) day pauses a streak
// instead of breaking it, while a genuinely missed or never-addressed day still breaks it, and
// today never breaks a streak while it's still in progress. Mirrors backend/src/common/
// streaks.ts's classifyDay/applyPauseCap exactly (same rules, same MAX_CONSECUTIVE_PAUSE_DAYS)
// so the number shown here never disagrees with what the backend would compute for the same
// data — frontend duplicates this small pure engine rather than sharing a package across the
// frontend/backend boundary, same pattern already used throughout this codebase. Frontend only
// ever needs the CURRENT streak (ending at the most recent day); best-streak stays backend-only.
export type DayOutcome = "advance" | "pause" | "break";

export type ItemState = "done" | "skipped" | "missed" | "not_applicable" | "unresolved";

export function classifyDay(items: ItemState[], isToday: boolean): DayOutcome {
  const hasMissed = items.some((s) => s === "missed");
  const hasUnresolved = items.some((s) => s === "unresolved");
  const hasDone = items.some((s) => s === "done");

  if (hasMissed) return "break";
  if (hasUnresolved) return isToday ? "pause" : "break";
  return hasDone ? "advance" : "pause";
}

export const MAX_CONSECUTIVE_PAUSE_DAYS = 7;

export function applyPauseCap(outcomes: DayOutcome[]): DayOutcome[] {
  const capped: DayOutcome[] = [];
  let consecutivePauses = 0;
  for (const outcome of outcomes) {
    if (outcome === "pause") {
      consecutivePauses++;
      if (consecutivePauses > MAX_CONSECUTIVE_PAUSE_DAYS) {
        capped.push("break");
        consecutivePauses = 0;
      } else {
        capped.push("pause");
      }
    } else {
      consecutivePauses = 0;
      capped.push(outcome);
    }
  }
  return capped;
}

// `outcomes` must already be in chronological order, containing only scheduled days.
// `pausedToday` reflects whether the most recent day in the sequence is itself a pause (used
// to show a "Streak paused today" note next to the badge).
export function currentStreakFromOutcomes(outcomes: DayOutcome[]): { current: number; pausedToday: boolean } {
  const capped = applyPauseCap(outcomes);

  let current = 0;
  for (let i = capped.length - 1; i >= 0; i--) {
    if (capped[i] === "advance") current++;
    else if (capped[i] === "pause") continue;
    else break;
  }

  const pausedToday = capped.length > 0 && capped[capped.length - 1] === "pause";
  return { current, pausedToday };
}
