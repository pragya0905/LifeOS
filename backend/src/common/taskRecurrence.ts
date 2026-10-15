import type { RecurrenceFrequency, TaskRecurrence } from "./types";

const FREQUENCIES: RecurrenceFrequency[] = ["daily", "weekly", "every_n_days", "monthly"];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function isValidRecurrence(value: unknown): value is TaskRecurrence {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  if (!FREQUENCIES.includes(r.frequency as RecurrenceFrequency)) return false;
  if (r.frequency === "weekly" && r.daysOfWeek !== undefined) {
    if (!Array.isArray(r.daysOfWeek) || !r.daysOfWeek.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
      return false;
    }
  }
  if (r.frequency === "every_n_days") {
    if (typeof r.intervalDays !== "number" || !Number.isInteger(r.intervalDays) || r.intervalDays < 1) return false;
  }
  if (r.frequency === "monthly") {
    if (typeof r.dayOfMonth !== "number" || !Number.isInteger(r.dayOfMonth) || r.dayOfMonth < 1 || r.dayOfMonth > 31) {
      return false;
    }
  }
  return true;
}

// Local-date arithmetic in UTC (no "Z"-suffix ambiguity concerns here since every input/output
// is a bare YYYY-MM-DD) — mirrors computeEndDate's pattern in medications.ts.
function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

function nextMonthlyDate(base: string, dayOfMonth: number): string {
  const d = new Date(`${base}T00:00:00.000Z`);
  let year = d.getUTCFullYear();
  let month = d.getUTCMonth() + 1;
  if (month > 11) {
    month = 0;
    year += 1;
  }
  const clampedDay = Math.min(dayOfMonth, daysInMonth(year, month));
  return new Date(Date.UTC(year, month, clampedDay)).toISOString().slice(0, 10);
}

// Base date is the later of the task's own due date and today — guarantees the next
// occurrence is never already overdue the moment it's created, even if the task was
// completed well past its original due date.
export function computeNextOccurrence(recurrence: TaskRecurrence, dueDate: string | undefined, today: string): string {
  const base = dueDate && dueDate > today ? dueDate : today;

  switch (recurrence.frequency) {
    case "daily":
      return addDays(base, 1);
    case "every_n_days":
      return addDays(base, recurrence.intervalDays ?? 1);
    case "monthly":
      return nextMonthlyDate(base, recurrence.dayOfMonth ?? new Date(`${base}T00:00:00.000Z`).getUTCDate());
    case "weekly": {
      const days = recurrence.daysOfWeek && recurrence.daysOfWeek.length > 0 ? recurrence.daysOfWeek : ALL_DAYS;
      for (let i = 1; i <= 7; i++) {
        const candidate = addDays(base, i);
        const dayOfWeek = new Date(`${candidate}T00:00:00.000Z`).getUTCDay();
        if (days.includes(dayOfWeek)) return candidate;
      }
      return addDays(base, 1); // unreachable — ALL_DAYS/days always matches within 7 days
    }
  }
}
