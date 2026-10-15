import type { Wish } from "../types";

export function wishIsIncrementable(wish: Wish): boolean {
  return wish.progressMode === "quantity" || wish.progressMode === "percentage" || wish.progressMode === "milestone";
}

// The single-tap "bump progress by one step" used by both the quick-add sheet's wish
// row and the Today page's "continue [most recent wish]" chip — same branching either
// call site would otherwise have to duplicate. Returns the PATCH body to send; the
// caller is responsible for actually calling the API (keeps this testable without a
// network dependency) and for applying/reverting the result in its own state.
export function nextWishIncrementPatch(wish: Wish): Record<string, unknown> | null {
  if (wish.progressMode === "quantity") {
    return { quantityCurrent: (wish.quantityCurrent ?? 0) + 1 };
  }
  if (wish.progressMode === "percentage") {
    return { percentage: Math.min((wish.percentage ?? 0) + 10, 100) };
  }
  if (wish.progressMode === "milestone") {
    const nextMilestone = (wish.milestones ?? []).find((m) => !m.done);
    if (!nextMilestone) return null;
    return {
      milestones: (wish.milestones ?? []).map((m) => (m.id === nextMilestone.id ? { ...m, done: true } : m)),
    };
  }
  // habit_linked and time_based progress aren't a single steppable value.
  return null;
}

export function wishRevertPatch(wish: Wish): Record<string, unknown> {
  return { quantityCurrent: wish.quantityCurrent, percentage: wish.percentage, milestones: wish.milestones };
}
