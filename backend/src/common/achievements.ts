import { computeEndDate } from "./medications";
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

// A day counts toward the routine streak if ANY of the user's routines had every one of its
// (current) steps logged done that day — same all-or-nothing rule Routines.tsx's own streak
// display uses, just rolled up across every routine instead of per-routine.
function computeRoutineBestStreak(routineLogs: RoutineStepLog[], routines: RoutineTemplate[]): number {
  const routineById = new Map(routines.map((r) => [r.routineId, r]));
  const logsByDateRoutine = new Map<string, RoutineStepLog[]>();
  for (const log of routineLogs) {
    const key = `${log.date}#${log.routineId}`;
    const list = logsByDateRoutine.get(key) ?? [];
    list.push(log);
    logsByDateRoutine.set(key, list);
  }

  const fullyCompletedDays = new Set<string>();
  for (const [key, logs] of logsByDateRoutine) {
    const [date, routineId] = key.split("#");
    const routine = routineById.get(routineId);
    if (!routine || routine.steps.length === 0) continue;
    const allDone = routine.steps.every((_, index) => logs.some((l) => l.stepIndex === index && l.status === "done"));
    if (allDone) fullyCompletedDays.add(date);
  }

  return bestStreak([...fullyCompletedDays].sort());
}

// A day counts toward the medication streak if every medication that was active on that
// specific date (by its own startDate/durationDays, not today's date) was logged taken.
function computeMedicationBestStreak(medicationLogs: MedicationLog[], medications: Medication[]): number {
  const logsByDate = new Map<string, MedicationLog[]>();
  for (const log of medicationLogs) {
    const list = logsByDate.get(log.date) ?? [];
    list.push(log);
    logsByDate.set(log.date, list);
  }

  const perfectDays = new Set<string>();
  for (const [date, logs] of logsByDate) {
    const activeThatDay = medications.filter((m) => date >= m.startDate && date <= computeEndDate(m.startDate, m.durationDays));
    if (activeThatDay.length === 0) continue;
    const allTaken = activeThatDay.every((m) => logs.some((l) => l.medicationId === m.medicationId && l.status === "taken"));
    if (allTaken) perfectDays.add(date);
  }

  return bestStreak([...perfectDays].sort());
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
  if (computeRoutineBestStreak(inputs.routineLogs, inputs.routines) >= 7) earned.add("routine-consistent");

  if (inputs.medicationLogsTaken >= 1) earned.add("medication-starter");
  if (computeMedicationBestStreak(inputs.medicationLogs, inputs.medications) >= 7) earned.add("medication-consistent");

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
