import type { WishHabitType, WishMilestone, WishProgressMode, WishStatus, WishType } from "./types";

export const WISH_TYPES: WishType[] = [
  "learning",
  "travel",
  "savings",
  "health",
  "shopping",
  "creative",
  "personal_growth",
  "achievement",
];

export const WISH_PROGRESS_MODES: WishProgressMode[] = [
  "percentage",
  "milestone",
  "habit_linked",
  "time_based",
  "quantity",
];

export const WISH_STATUSES: WishStatus[] = ["active", "completed", "abandoned"];
export const WISH_HABIT_TYPES: WishHabitType[] = ["water", "exercise", "steps"];

export function isValidMilestones(value: unknown): value is WishMilestone[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (m) =>
      m &&
      typeof m === "object" &&
      typeof m.id === "string" &&
      typeof m.text === "string" &&
      typeof m.done === "boolean" &&
      (m.targetDate === undefined || typeof m.targetDate === "string"),
  );
}
