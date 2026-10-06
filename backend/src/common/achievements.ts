import type { HabitLog, JournalEntry, MedicationLog, RoutineStepLog, Task, Wish } from "./types";

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
  { key: "routine-consistent", label: "Routine regular", description: "Complete 20 routine steps.", emoji: "🌟" },
  { key: "medication-starter", label: "On schedule", description: "Log your first medication taken.", emoji: "💊" },
  {
    key: "medication-consistent",
    label: "Consistent care",
    description: "Log 20 medications taken.",
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
// strings — used for every streak badge (habits today, extendable to other domains later).
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

export interface AchievementInputs {
  doneTasks: number;
  journalEntries: number;
  habitLogs: HabitLog[];
  routineLogsDone: number;
  medicationLogsTaken: number;
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
  if (inputs.routineLogsDone >= 20) earned.add("routine-consistent");

  if (inputs.medicationLogsTaken >= 1) earned.add("medication-starter");
  if (inputs.medicationLogsTaken >= 20) earned.add("medication-consistent");

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
