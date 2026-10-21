// Forgiving streaks: a Skipped (or, for routine steps, Not-Applicable) day pauses a streak
// instead of breaking it, while a genuinely missed or never-addressed day still breaks it, and
// today never breaks a streak while it's still in progress. Shared by routines (multiple
// "items" — steps — per day) and medications (exactly one item per day, enforced by the
// MedicationLogs table's own userId+dateMedicationId key schema). Adherence percentages are a
// completely separate calculation (frontend's computeAdherence) and are untouched by this.
export type DayOutcome = "advance" | "pause" | "break";

export type ItemState = "done" | "skipped" | "missed" | "not_applicable" | "unresolved";

// break: at least one expected item is unresolved (no log at all) and the day is already over —
//   a routine step or medication dose nobody ever addressed. An explicit "missed" medication log
//   counts the same as unresolved; routine steps have no "missed" status, so unresolved is the
//   only way a routine step contributes a break.
// advance: nothing unresolved, and at least one item is Done/Taken.
// pause: nothing unresolved, and every item is Skipped/N-A (nothing Done/Taken either).
// `isToday`: if the raw classification would be "break" solely because of an unresolved item
//   (the day just isn't over yet), downgrade to "pause" instead — never because of an explicit
//   "missed" log, which is a real, already-recorded failure even on today's own date.
export function classifyDay(items: ItemState[], isToday: boolean): DayOutcome {
  const hasMissed = items.some((s) => s === "missed");
  const hasUnresolved = items.some((s) => s === "unresolved");
  const hasDone = items.some((s) => s === "done");

  if (hasMissed) return "break";
  if (hasUnresolved) return isToday ? "pause" : "break";
  return hasDone ? "advance" : "pause";
}

// Caps how many consecutive Skipped/N-A days can pause a streak before it's treated as
// abandoned — without this, "pause" would be an unlimited escape hatch (skip forever, the
// streak technically never dies). A named constant so it's visible and easy to tune in one
// place, not a magic number buried in a loop.
export const MAX_CONSECUTIVE_PAUSE_DAYS = 7;

// Converts a day that would be the (MAX_CONSECUTIVE_PAUSE_DAYS + 1)th *consecutive* pause into
// a break. Any advance or break resets the consecutive-pause count to 0, so a fresh run of
// pauses after a cap-triggered break starts counting from zero again — it does not keep
// breaking every subsequent day.
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

// `outcomes` must already be in chronological order, containing only scheduled days (unscheduled
// days are simply never added to this array by the caller, same as today). `current` is the
// streak as of the most recent day in the array (walks backward: advances/holds on pause/stops
// on the first break). `best` is the longest run ever achieved anywhere in the sequence.
export function streakFromOutcomes(outcomes: DayOutcome[]): { current: number; best: number } {
  const capped = applyPauseCap(outcomes);

  let current = 0;
  for (let i = capped.length - 1; i >= 0; i--) {
    if (capped[i] === "advance") current++;
    else if (capped[i] === "pause") continue;
    else break;
  }

  let best = 0;
  let running = 0;
  for (const outcome of capped) {
    if (outcome === "advance") {
      running++;
      best = Math.max(best, running);
    } else if (outcome === "pause") {
      best = Math.max(best, running);
    } else {
      running = 0;
    }
  }

  return { current, best };
}
