import type { Task } from "./types";

// dueAtUtc is computed browser-side from dueDate+dueTime in the user's own local timezone —
// prefer it. Reconstructing a Date from the bare dueDate/dueTime strings server-side is
// ambiguous: Lambda runs in UTC, so e.g. "13:00" gets interpreted as 13:00 UTC rather than
// the user's actual local 13:00, skewing the result by the user's UTC offset.
export function hoursUntilDue(
  task: Pick<Task, "dueDate" | "dueTime" | "dueAtUtc">,
  now: Date,
): number | undefined {
  if (task.dueAtUtc) {
    return (new Date(task.dueAtUtc).getTime() - now.getTime()) / (1000 * 60 * 60);
  }
  if (!task.dueDate) return undefined;
  const due = new Date(`${task.dueDate}T${task.dueTime ?? "23:59"}:00`);
  return (due.getTime() - now.getTime()) / (1000 * 60 * 60);
}

// Deterministic guardrail: an unstarted task literally cannot finish in time if the hours
// remaining until its deadline are less than the estimated effort — no ambiguity, no need to
// ask the model. Shared by suggestTaskPriority (claude.ts, evaluated at create/update time)
// and taskReminderScheduler (which re-evaluates this in the background as time passes, since
// nothing else ever re-checks it once a task is created).
export function isSlackExhausted(
  task: Pick<Task, "dueDate" | "dueTime" | "dueAtUtc" | "estimatedHours">,
  now: Date,
): boolean {
  if (task.estimatedHours === undefined) return false;
  const remaining = hoursUntilDue(task, now);
  if (remaining === undefined) return false;
  return remaining <= task.estimatedHours;
}
