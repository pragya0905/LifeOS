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
