import type { RoutineStepLog, RoutineTemplate } from "../types";
import { todayLocal } from "./date";

export const STREAK_WINDOW_DAYS = 30;

function daysAgo(n: number): string {
  const d = new Date(`${todayLocal()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export function routineStreakWindowStart(): string {
  return daysAgo(STREAK_WINDOW_DAYS - 1);
}

// A day "counts" toward the streak only if every step of the routine was logged done OR
// not_applicable that day — a single skipped or missing step breaks it, same rigor as
// Medications' adherence. not_applicable is exempted rather than counted as a miss, since it
// means the step genuinely didn't apply that day, not that it was neglected.
// Today never breaks the streak just because it isn't finished yet (the day isn't over).
export function computeRoutineStreak(
  routine: RoutineTemplate,
  logsByDateStep: Map<string, RoutineStepLog["status"]>,
): number {
  let streak = 0;
  for (let i = 0; i < STREAK_WINDOW_DAYS; i++) {
    const dateStr = daysAgo(i);
    const complete = routine.steps.every((_, index) => {
      const status = logsByDateStep.get(`${dateStr}#${routine.routineId}#${index}`);
      return status === "done" || status === "not_applicable";
    });
    if (complete) {
      streak++;
    } else if (i === 0) {
      continue; // today not finished yet — doesn't break the streak
    } else {
      break;
    }
  }
  return streak;
}
