import { computeEndDate, isMedicationActiveOnDate } from "./medications";
import { routineAppliesOnDate } from "./journal";
import { today as localToday } from "./localTime";
import { classifyDay, streakFromOutcomes, type DayOutcome, type ItemState } from "./streaks";
import type {
  HabitLog,
  JournalEntry,
  Medication,
  MedicationLog,
  RoutineStepLog,
  RoutineTemplate,
  Task,
  Wish,
} from "./types";

export interface BadgeDefinition {
  key: string;
  label: string;
  description: string;
  emoji: string;
}

// Ordered catalog — the order badges appear in both the API response and the UI. Mixes true
// streaks (consistency) with cumulative counts and firsts (milestones), per the user's ask for
// both. Once a badgeKey is written to AchievementsTable it's never re-evaluated or revoked —
// these are permanent records of having reached a bar at least once, not a live status.
export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  { key: "first-task", label: "First task done", description: "Complete your first task.", emoji: "✅" },
  { key: "task-master", label: "Task master", description: "Complete 10 tasks.", emoji: "🏅" },
  { key: "task-champion", label: "Task champion", description: "Complete 50 tasks.", emoji: "🏆" },
  { key: "journaler", label: "Journaler", description: "Write 5 journal entries.", emoji: "📓" },
  { key: "journal-habit", label: "Journal habit", description: "Write 30 journal entries.", emoji: "📚" },
  { key: "streak-3", label: "3-day streak", description: "Log a habit 3 days in a row.", emoji: "🔥" },
  { key: "streak-7", label: "7-day streak", description: "Log a habit 7 days in a row.", emoji: "🔥" },
  { key: "streak-30", label: "30-day streak", description: "Log a habit 30 days in a row.", emoji: "🔥" },
  { key: "routine-starter", label: "Routine starter", description: "Complete your first routine step.", emoji: "🪞" },
  {
    key: "routine-consistent",
    label: "Routine regular",
    description: "Finish an entire routine, every step, 7 days in a row.",
    emoji: "🌟",
  },
  { key: "medication-starter", label: "On schedule", description: "Log your first medication taken.", emoji: "💊" },
  {
    key: "medication-consistent",
    label: "Consistent care",
    description: "Take every active medication 7 days in a row.",
    emoji: "💙",
  },
  { key: "first-wish", label: "First wish", description: "Create your first wish.", emoji: "🌠" },
  { key: "wish-achiever", label: "Wish achiever", description: "Complete a wish.", emoji: "🎉" },
];

function daysBetween(a: string, b: string): number {
  const d1 = new Date(`${a}T00:00:00Z`);
  const d2 = new Date(`${b}T00:00:00Z`);
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

// Longest run of calendar-consecutive dates in a sorted, deduplicated list of YYYY-MM-DD
// strings — the shared engine behind every streak badge (habits, routines, medications).
function bestStreak(sortedDates: string[]): number {
  if (sortedDates.length === 0) return 0;
  let best = 1;
  let current = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    if (daysBetween(sortedDates[i - 1], sortedDates[i]) === 1) {
      current++;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }
  return best;
}

// One routine's own day-by-day outcome sequence, from the day it was created through today —
// not just the days it happens to have logs for, so a step nobody ever logged still correctly
// counts as an unresolved/break day rather than being silently skipped. Days the routine isn't
// scheduled on (routineAppliesOnDate false) are excluded entirely, same as a medication's
// off-days — they can't advance, pause, or break anything.
function buildRoutineOutcomes(routine: RoutineTemplate, routineLogs: RoutineStepLog[], todayStr: string): DayOutcome[] {
  if (routine.steps.length === 0) return [];
  const logsByDate = new Map<string, RoutineStepLog[]>();
  for (const log of routineLogs) {
    if (log.routineId !== routine.routineId) continue;
    const list = logsByDate.get(log.date) ?? [];
    list.push(log);
    logsByDate.set(log.date, list);
  }

  const startDate = routine.createdAt.slice(0, 10);
  if (startDate > todayStr) return [];

  const outcomes: DayOutcome[] = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${todayStr}T00:00:00Z`);
  while (cursor <= end) {
    const dateStr = cursor.toISOString().slice(0, 10);
    if (routineAppliesOnDate(routine.daysOfWeek, dateStr)) {
      const dayLogs = logsByDate.get(dateStr) ?? [];
      const items: ItemState[] = routine.steps.map((_, index) => {
        const log = dayLogs.find((l) => l.stepIndex === index);
        if (!log) return "unresolved";
        return log.status === "done" ? "done" : log.status === "not_applicable" ? "not_applicable" : "skipped";
      });
      outcomes.push(classifyDay(items, dateStr === todayStr));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return outcomes;
}

// One medication's own day-by-day outcome sequence, bounded to its own startDate..endDate range
// (computeEndDate(startDate, durationDays)) — days before it started or after it ended are
// excluded entirely, same as an off-day under daysOfWeek, never advancing/pausing/breaking
// anything. Exactly one item per day: the MedicationLogs table's own key schema
// (userId + "date#medicationId") enforces a single log row per day, so there is no multi-dose
// concept to account for.
function buildMedicationOutcomes(medication: Medication, medicationLogs: MedicationLog[], todayStr: string): DayOutcome[] {
  const logsByDate = new Map<string, MedicationLog>();
  for (const log of medicationLogs) {
    if (log.medicationId === medication.medicationId) logsByDate.set(log.date, log);
  }

  const endDate = computeEndDate(medication.startDate, medication.durationDays);
  const scanEnd = endDate < todayStr ? endDate : todayStr;
  if (medication.startDate > scanEnd) return [];

  const outcomes: DayOutcome[] = [];
  const cursor = new Date(`${medication.startDate}T00:00:00Z`);
  const end = new Date(`${scanEnd}T00:00:00Z`);
  while (cursor <= end) {
    const dateStr = cursor.toISOString().slice(0, 10);
    if (isMedicationActiveOnDate(medication, dateStr)) {
      const log = logsByDate.get(dateStr);
      const item: ItemState = !log ? "unresolved" : log.status === "taken" ? "done" : log.status === "skipped" ? "skipped" : "missed";
      outcomes.push(classifyDay([item], dateStr === todayStr));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return outcomes;
}

// Per-routine and per-medication current/best streaks, keyed by id — replaces the old single
// user-wide "best streak" number (a day used to count if ANY routine was fully done that day,
// unioned across all of them). Each routine/medication now sustains its own streak; see the
// achievements.test.ts comment on computeEligibleBadgeKeys for how the badge threshold changed.
export function computeRoutineStreaks(
  routineLogs: RoutineStepLog[],
  routines: RoutineTemplate[],
  timezoneOffsetMinutes?: number,
): Map<string, { current: number; best: number }> {
  const todayStr = localToday(timezoneOffsetMinutes);
  const result = new Map<string, { current: number; best: number }>();
  for (const routine of routines) {
    result.set(routine.routineId, streakFromOutcomes(buildRoutineOutcomes(routine, routineLogs, todayStr)));
  }
  return result;
}

export function computeMedicationStreaks(
  medicationLogs: MedicationLog[],
  medications: Medication[],
  timezoneOffsetMinutes?: number,
): Map<string, { current: number; best: number }> {
  const todayStr = localToday(timezoneOffsetMinutes);
  const result = new Map<string, { current: number; best: number }>();
  for (const medication of medications) {
    result.set(medication.medicationId, streakFromOutcomes(buildMedicationOutcomes(medication, medicationLogs, todayStr)));
  }
  return result;
}

export interface AchievementInputs {
  doneTasks: number;
  journalEntries: number;
  habitLogs: HabitLog[];
  routineLogsDone: number;
  routineLogs: RoutineStepLog[];
  routines: RoutineTemplate[];
  medicationLogsTaken: number;
  medicationLogs: MedicationLog[];
  medications: Medication[];
  wishes: Wish[];
  // Optional — JS Date#getTimezoneOffset() convention, same as chatAssistant/Medication's own
  // existing usage. Lets the routine/medication streak calc know the caller's real "today"
  // instead of the Lambda's UTC date; absent (old/un-updated client) falls back to UTC.
  timezoneOffsetMinutes?: number;
}

// Pure eligibility check — given everything needed, returns which badge keys currently qualify
// (regardless of whether they're already stored). The caller diffs this against what's already
// in AchievementsTable to find newly-earned ones.
export function computeEligibleBadgeKeys(inputs: AchievementInputs): Set<string> {
  const earned = new Set<string>();

  if (inputs.doneTasks >= 1) earned.add("first-task");
  if (inputs.doneTasks >= 10) earned.add("task-master");
  if (inputs.doneTasks >= 50) earned.add("task-champion");

  if (inputs.journalEntries >= 5) earned.add("journaler");
  if (inputs.journalEntries >= 30) earned.add("journal-habit");

  const activeHabitDays = [...new Set(inputs.habitLogs.filter((h) => (h.value ?? 0) > 0).map((h) => h.date))].sort();
  const longestHabitStreak = bestStreak(activeHabitDays);
  if (longestHabitStreak >= 3) earned.add("streak-3");
  if (longestHabitStreak >= 7) earned.add("streak-7");
  if (longestHabitStreak >= 30) earned.add("streak-30");

  if (inputs.routineLogsDone >= 1) earned.add("routine-starter");
  // Per-routine, not a day-union across all routines (see computeRoutineStreaks' comment) —
  // the badge asks whether any ONE routine has sustained a 7-day streak of its own.
  const routineBestStreaks = [...computeRoutineStreaks(inputs.routineLogs, inputs.routines, inputs.timezoneOffsetMinutes).values()].map((s) => s.best);
  if (routineBestStreaks.some((best) => best >= 7)) earned.add("routine-consistent");

  if (inputs.medicationLogsTaken >= 1) earned.add("medication-starter");
  const medicationBestStreaks = [...computeMedicationStreaks(inputs.medicationLogs, inputs.medications, inputs.timezoneOffsetMinutes).values()].map((s) => s.best);
  if (medicationBestStreaks.some((best) => best >= 7)) earned.add("medication-consistent");

  if (inputs.wishes.length >= 1) earned.add("first-wish");
  if (inputs.wishes.some((w) => w.status === "completed")) earned.add("wish-achiever");

  return earned;
}

// Helper for the handler — counts "done" entries directly from already-fetched log arrays, so
// the handler doesn't need to know these shapes.
export function countDoneTasks(tasks: Task[]): number {
  return tasks.filter((t) => t.status === "done").length;
}
export function countJournalEntries(entries: JournalEntry[]): number {
  return entries.length;
}
export function countRoutineLogsDone(logs: RoutineStepLog[]): number {
  return logs.filter((l) => l.status === "done").length;
}
export function countMedicationLogsTaken(logs: MedicationLog[]): number {
  return logs.filter((l) => l.status === "taken").length;
}
