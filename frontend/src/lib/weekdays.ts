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
