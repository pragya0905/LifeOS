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
