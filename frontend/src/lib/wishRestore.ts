import type { Wish } from "../types";

// Undo for a deleted wish recreates it from its definition only. Photos are deleted with the wish,
// and progress (percentage, milestones, quantity so far) can't be re-entered, so Undo is offered
// only when recreating the wish loses nothing.
export function canRestoreWish(w: Wish): boolean {
  return (
    (w.imageKeys?.length ?? 0) === 0 &&
    (w.milestones?.length ?? 0) === 0 &&
    !w.percentage &&
    !w.quantityCurrent &&
    w.status === "active"
  );
}

// The fields POST /wishes accepts, taken from the deleted wish.
export function wishDefinition(w: Wish): Record<string, unknown> {
  return {
    title: w.title,
    type: w.type,
    progressMode: w.progressMode,
    targetDate: w.targetDate,
    quantityTarget: w.quantityTarget,
    quantityUnit: w.quantityUnit,
    linkedHabitType: w.linkedHabitType,
    habitLinkTargetValue: w.habitLinkTargetValue,
  };
}
