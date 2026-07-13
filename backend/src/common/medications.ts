export function computeEndDate(startDate: string, durationDays: number): string {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() + durationDays - 1);
  return start.toISOString().slice(0, 10);
}
