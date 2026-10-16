// `Date#toISOString()` always renders the UTC date, not the viewer's local
// calendar date. For a user east of UTC (e.g. IST, UTC+5:30), local midnight
// still falls on the previous UTC day, so anything computing "today" via
// `.toISOString().slice(0, 10)` shows yesterday's date for the first few
// hours of the local day. These helpers use the local calendar date instead.
export function toLocalDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayLocal(): string {
  return toLocalDateStr(new Date());
}

// Local-time parse (no "Z" suffix) so this shifts calendar days consistently with the
// toLocalDateStr/todayLocal pair above, rather than drifting by the viewer's UTC offset.
export function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return toLocalDateStr(d);
}

// Shared by Tasks.tsx and the quick-add sheet — parses dueDate+dueTime in the browser's
// own local timezone (no "Z" suffix) so the resulting instant is unambiguous, same
// reasoning as createTask's dueAtUtc comment on the backend.
export function computeDueAtUtc(dueDate: string, dueTime: string): string | undefined {
  if (!dueDate || !dueTime) return undefined;
  const d = new Date(`${dueDate}T${dueTime}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

// "23:59" is the quick-add forms' default due time (not a real appointment the user picked),
// so it reads as "End of day" everywhere a task's due time is shown — any other time
// displays as-is (the user did pick a specific time).
export const END_OF_DAY_TIME = "23:59";

export function formatDueTime(dueTime: string | undefined): string | undefined {
  if (!dueTime) return undefined;
  return dueTime === END_OF_DAY_TIME ? "End of day" : dueTime;
}

// Shared by the quick-add sheet's Task form and the Tasks page's own add/edit forms — same
// chips everywhere a due time is picked, so they don't drift apart. A faster way to pick a
// common time than the native time input below, which still works for anything more specific.
export const TASK_TIME_PRESETS: { label: string; time: string }[] = [
  { label: "Morning", time: "09:00" },
  { label: "Afternoon", time: "14:00" },
  { label: "Evening", time: "18:00" },
  { label: "Night", time: "21:00" },
  { label: "End of day", time: END_OF_DAY_TIME },
];

// Strict YYYY-MM-DD check (format AND calendar validity, e.g. rejects "2026-13-40") — used to
// validate a `?date=` URL param before trusting it, since it comes from the address bar.
export function isValidDateStr(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime()) && toLocalDateStr(d) === s;
}
