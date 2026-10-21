import type { RoutineStepLog, RoutineTemplate } from "../types";
import { todayLocal } from "./date";
import { classifyDay, currentStreakFromOutcomes, type DayOutcome, type ItemState } from "./streakEngine";

export const STREAK_WINDOW_DAYS = 30;

function daysAgo(n: number): string {
  const d = new Date(`${todayLocal()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export function routineStreakWindowStart(): string {
  return daysAgo(STREAK_WINDOW_DAYS - 1);
}

// Forgiving streak: a day advances only if no step is unresolved (missing) and at least one
// step is Done; if nothing is unresolved but nothing is Done either (every step Skipped/N-A),
// the day pauses instead of breaking — mirrors backend/src/common/streaks.ts's classifyDay
// exactly (same rules, same MAX_CONSECUTIVE_PAUSE_DAYS via streakEngine.ts), so the number
// shown here never disagrees with what the backend would compute for the same data. Today
// never breaks the streak just because it isn't finished yet (the day isn't over).
export function computeRoutineStreak(
  routine: RoutineTemplate,
  logsByDateStep: Map<string, RoutineStepLog["status"]>,
): { current: number; pausedToday: boolean } {
  const outcomes: DayOutcome[] = [];
  for (let i = STREAK_WINDOW_DAYS - 1; i >= 0; i--) {
    const dateStr = daysAgo(i);
    const items: ItemState[] = routine.steps.map((_, index) => {
      const status = logsByDateStep.get(`${dateStr}#${routine.routineId}#${index}`);
      if (!status) return "unresolved";
      return status === "done" ? "done" : status === "not_applicable" ? "not_applicable" : "skipped";
    });
    outcomes.push(classifyDay(items, i === 0));
  }
  return currentStreakFromOutcomes(outcomes);
}
