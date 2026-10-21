// Confirmed live bug (not theoretical) if this is skipped: with no offset, "today" is the
// Lambda's UTC server date — for a user in IST (UTC+5:30), that's the WRONG calendar day for
// roughly 00:00-05:30 IST every night, since UTC hasn't rolled over to the new day yet.
// timezoneOffsetMinutes uses JS Date#getTimezoneOffset() convention (IST = -330), so
// local = UTC - offsetMinutes. Mirrors chatAssistant/index.ts's own localNow/today helpers
// exactly (same sign convention, same UTC fallback) — used only by achievements/
// getAchievements for now. chatAssistant keeps its own copy un-touched so this streak change
// deploys without redeploying ChatAssistantFunction; deduplicating the two is deferred to a
// separate change.
export function localNow(timezoneOffsetMinutes: number | undefined): Date {
  return timezoneOffsetMinutes === undefined ? new Date() : new Date(Date.now() - timezoneOffsetMinutes * 60000);
}

export function today(timezoneOffsetMinutes?: number): string {
  return localNow(timezoneOffsetMinutes).toISOString().slice(0, 10);
}

// Untrusted input (a query/body param) — a request with a garbage or wildly out-of-range value
// must fall back to the honest UTC default, never throw. ±840 minutes (±14h) is the full real-
// world UTC-offset range (UTC+14 to UTC-12, the widest standard zones in use).
const MAX_ABS_OFFSET_MINUTES = 840;

export function parseTimezoneOffsetMinutes(raw: unknown): number | undefined {
  // `Number("")` is 0, not NaN — an empty string must not silently become "UTC+0".
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  return Number.isFinite(n) && Math.abs(n) <= MAX_ABS_OFFSET_MINUTES ? n : undefined;
}
