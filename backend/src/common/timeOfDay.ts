// Shared "HH:MM" validation. Every time-of-day field across the app — routine/medication
// timeOfDay and endTime, habit/call startTime, sleep bedTime/wakeTime — used its own ad hoc
// /^\d{2}:\d{2}$/ regex, which checks digit shape only: "25:99" matches it just as well as
// "09:30" does, since it never constrains the hour to 00-23 or the minute to 00-59. Centralized
// here with the actual range checked, so every caller gets the real validation for free.
const TIME_OF_DAY_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTimeOfDay(value: unknown): value is string {
  return typeof value === "string" && TIME_OF_DAY_RE.test(value);
}
