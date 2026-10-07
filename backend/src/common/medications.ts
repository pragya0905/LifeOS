import type { Medication } from "./types";

export function computeEndDate(startDate: string, durationDays: number): string {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() + durationDays - 1);
  return start.toISOString().slice(0, 10);
}

// The one place "is this medication active on date X" is decided — every caller (the reminder
// scheduler, the achievements streak engine, the daily check-in status, the journal
// AI-extraction medication matcher) used to duplicate the startDate/durationDays range check
// and none of them accounted for daysOfWeek, so adding it here fixes all of them at once.
export function isMedicationActiveOnDate(
  medication: Pick<Medication, "startDate" | "durationDays" | "daysOfWeek">,
  dateStr: string,
): boolean {
  if (dateStr < medication.startDate || dateStr > computeEndDate(medication.startDate, medication.durationDays)) {
    return false;
  }
  if (!medication.daysOfWeek || medication.daysOfWeek.length === 0) return true;
  const dayOfWeek = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return medication.daysOfWeek.includes(dayOfWeek);
}
