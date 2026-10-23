// Decides whether a routine's reminder should go out on this scheduler run. Mirrors the
// medication reminder: the user's local time is reconstructed from timeOfDay plus the
// timezoneOffsetMinutes the browser reported when the routine was saved (JS getTimezoneOffset()
// convention: minutes to ADD to local time to reach UTC).

export interface ReminderRoutine {
  timeOfDay?: string;
  daysOfWeek?: number[];
  remindMe?: boolean;
  reminderLeadMinutes?: number;
  timezoneOffsetMinutes?: number;
  lastReminderSentDate?: string;
}

// The calendar date (YYYY-MM-DD) the user is on right now, in their own timezone.
export function localDateStr(now: Date, timezoneOffsetMinutes: number): string {
  return new Date(now.getTime() - timezoneOffsetMinutes * 60000).toISOString().slice(0, 10);
}

// Returns today's local date when the reminder should fire on this run, otherwise null.
// "Fires" means the reminder instant (start time minus lead) falls inside the next window.
export function routineReminderDate(routine: ReminderRoutine, now: Date, windowMinutes: number): string | null {
  if (!routine.remindMe || !routine.timeOfDay || routine.timezoneOffsetMinutes === undefined) return null;
  const tz = routine.timezoneOffsetMinutes;
  const today = localDateStr(now, tz);
  if (routine.lastReminderSentDate === today) return null;

  const days = routine.daysOfWeek && routine.daysOfWeek.length > 0 ? routine.daysOfWeek : undefined;
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  if (days && !days.includes(weekday)) return null;

  const [year, month, day] = today.split("-").map(Number);
  const [hour, minute] = routine.timeOfDay.split(":").map(Number);
  const leadMs = (routine.reminderLeadMinutes ?? 0) * 60000;
  const target = Date.UTC(year, month - 1, day, hour, minute) + tz * 60000 - leadMs;
  const nowMs = now.getTime();
  return target >= nowMs && target <= nowMs + windowMinutes * 60000 ? today : null;
}
