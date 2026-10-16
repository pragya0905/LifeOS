// Shared 0=Sun..6=Sat convention (matches JS Date#getDay()) used by routines' daysOfWeek
// and meal plan templates' dayOfWeek.
export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function formatSchedule(daysOfWeek: number[] | undefined): string {
  if (!daysOfWeek || daysOfWeek.length === 0 || daysOfWeek.length === 7) return "Daily";
  return daysOfWeek
    .slice()
    .sort((a, b) => a - b)
    .map((d) => DAY_LABELS[d])
    .join(", ");
}

// Shared by Routines and Medications' "today" filtering — absent/empty daysOfWeek means every
// day, same convention formatSchedule renders as "Daily".
export function appliesOnDate(daysOfWeek: number[] | undefined, date: Date): boolean {
  return !daysOfWeek || daysOfWeek.length === 0 || daysOfWeek.includes(date.getDay());
}

// Shared by Routines.tsx, Medications.tsx, and the Today screen — items with no time sort
// to the end, after every timed one in ascending order. "HH:MM" strings already sort
// correctly lexicographically, no parsing needed. One sort, used everywhere either list
// appears, so Today's ordering never silently drifts from the dedicated pages'.
export function byTimeOfDay<T extends { timeOfDay?: string }>(a: T, b: T): number {
  if (!a.timeOfDay && !b.timeOfDay) return 0;
  if (!a.timeOfDay) return 1;
  if (!b.timeOfDay) return -1;
  return a.timeOfDay.localeCompare(b.timeOfDay);
}
