// Validators for the optional fields the timeline page uses. Each returns an error message,
// or null when the value is fine. Absent fields are the caller's concern, not these checks'.

const TIME_RE = /^\d{2}:\d{2}$/;
const MAX_MINUTES_IN_DAY = 1440;

export const BLOCK_TYPES = ["task", "protected"] as const;

export function checkEndTime(value: unknown): string | null {
  if (typeof value !== "string" || !TIME_RE.test(value)) return "endTime must be in HH:MM format";
  return null;
}

// One whole-minute duration per step. `stepCount`, when known, must match the step list.
export function checkStepMinutes(value: unknown, stepCount?: number): string | null {
  const valid = Array.isArray(value) && value.every((m) => Number.isInteger(m) && m > 0 && m <= MAX_MINUTES_IN_DAY);
  if (!valid) return "stepMinutes must be an array of whole minutes (1-1440), one per step";
  if (stepCount !== undefined && (value as unknown[]).length !== stepCount) {
    return "stepMinutes must have one entry per step";
  }
  return null;
}

export function checkReminderLead(value: unknown): string | null {
  const valid = Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 120;
  return valid ? null : "reminderLeadMinutes must be a whole number of minutes from 0 to 120";
}

// getTimezoneOffset() ranges from -840 (UTC+14) to +720 (UTC-12).
export function checkTimezoneOffset(value: unknown): string | null {
  const valid = Number.isInteger(value) && (value as number) >= -840 && (value as number) <= 720;
  return valid ? null : "timezoneOffsetMinutes must be a whole number of minutes between -840 and 720";
}

export function checkBlockType(value: unknown): string | null {
  return (BLOCK_TYPES as readonly unknown[]).includes(value) ? null : "blockType must be 'task' or 'protected'";
}
