import type { Medication, MedicationLog } from "../types";
import { STREAK_WINDOW_DAYS } from "./routineStreak";
import { classifyDay, currentStreakFromOutcomes, type DayOutcome, type ItemState } from "./streakEngine";

// Forgiving streak for medications — mirrors backend/src/common/streaks.ts and this file's
// routine counterpart (lib/routineStreak.ts) exactly: a Skipped day pauses instead of breaking,
// an explicit Missed or a never-logged day still breaks it (once the day is over), and today
// never breaks the streak while still in progress. Exactly one "item" per day (the dose) — no
// multi-dose concept, matching MedicationLogs' own one-row-per-day schema. Days before the
// medication's startDate, after its endDate, or outside its daysOfWeek are excluded entirely,
// same as an unscheduled day — they can't advance, pause, or break anything.
export function computeMedicationStreak(
  medication: Medication,
  logs: MedicationLog[],
  realToday: string,
): { current: number; pausedToday: boolean } {
  const statusByDate = new Map<string, MedicationLog["status"]>();
  for (const l of logs) {
    if (l.medicationId === medication.medicationId) statusByDate.set(l.date, l.status);
  }

  const outcomes: DayOutcome[] = [];
  const cursor = new Date(`${realToday}T00:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() - (STREAK_WINDOW_DAYS - 1));
  for (let i = 0; i < STREAK_WINDOW_DAYS; i++) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const applies = !medication.daysOfWeek || medication.daysOfWeek.length === 0 || medication.daysOfWeek.includes(cursor.getUTCDay());
    const inRange = dateStr >= medication.startDate && dateStr <= medication.endDate;
    if (applies && inRange) {
      const status = statusByDate.get(dateStr);
      const item: ItemState = !status ? "unresolved" : status === "taken" ? "done" : status === "skipped" ? "skipped" : "missed";
      outcomes.push(classifyDay([item], dateStr === realToday));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return currentStreakFromOutcomes(outcomes);
}
