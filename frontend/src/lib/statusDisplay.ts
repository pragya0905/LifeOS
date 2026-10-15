import type { MedicationLogStatus, RoutineStepStatus } from "../types";

// Quick reasons that fill the note field for a routine step's Skipped/Not applicable status
// — a tap fills the text input (still editable before saving), it doesn't submit by itself.
export const REASON_CHIPS = ["Sick", "Travelling", "Forgot", "Ran out", "Doctor's advice", "Other"];

// Status must always be visible as icon + label, never color alone — these are the labels
// that pair with it. The note suffix mirrors how a reason was captured (Skipped — Sick).
// A reasonless Skip reads as "rest day" rather than a bare, slightly judgmental "Skipped" —
// tasteful, not applied everywhere (N/A is already a neutral, non-judgmental state as-is).
export function routineStatusLabel(status: RoutineStepStatus, note?: string): string {
  if (status === "done") return "Done";
  if (status === "not_applicable") return note ? `N/A — ${note}` : "N/A";
  return note ? `Skipped — ${note}` : "Skipped — rest day";
}

export function medicationStatusLabel(status: MedicationLogStatus): string {
  return status === "taken" ? "Taken" : "Missed";
}
