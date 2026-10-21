import { describe, expect, it } from "vitest";
import { computeMedicationStreak } from "./medicationStreak";
import { todayLocal, addDays } from "./date";
import { MAX_CONSECUTIVE_PAUSE_DAYS } from "./streakEngine";
import type { Medication, MedicationLog } from "../types";

function medication(overrides: Partial<Medication> = {}): Medication {
  return {
    userId: "u1",
    medicationId: "m1",
    name: "Test Med",
    startDate: "2026-01-01",
    durationDays: 365,
    endDate: "2026-12-31",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function log(date: string, status: MedicationLog["status"]): MedicationLog {
  return { userId: "u1", dateMedicationId: `${date}#m1`, date, medicationId: "m1", status, source: "manual", createdAt: date, updatedAt: date };
}

// Same test matrix as backend/src/common/streaks.test.ts and routineStreak.test.ts — same
// inputs, same expected outcomes, so this implementation can't silently drift from the other
// two. Medications have exactly one item per day (the dose), so "missed" is reachable here
// (unlike routines, which have no missed status at all).
describe("computeMedicationStreak", () => {
  it("is 0 when nothing has ever been logged (today's own unresolved dose pauses rather than breaks it)", () => {
    expect(computeMedicationStreak(medication(), [], todayLocal())).toEqual({ current: 0, pausedToday: true });
  });

  it("counts consecutive taken days, stopping at a genuinely missing day", () => {
    const today = todayLocal();
    const y1 = addDays(today, -1);
    // y2 (today - 2) is intentionally never logged — a real gap.
    const y3 = addDays(today, -3);
    const logs = [log(today, "taken"), log(y1, "taken"), log(y3, "taken")];
    expect(computeMedicationStreak(medication(), logs, today)).toEqual({ current: 2, pausedToday: false }); // today + y1
  });

  it("an explicit Missed log breaks the streak, same as a never-logged gap", () => {
    const today = todayLocal();
    const y1 = addDays(today, -1);
    const y2 = addDays(today, -2);
    const logs = [log(today, "taken"), log(y1, "missed"), log(y2, "taken")];
    expect(computeMedicationStreak(medication(), logs, today).current).toBe(1); // today only
  });

  it("a Skipped day pauses instead of breaking", () => {
    const today = todayLocal();
    const y1 = addDays(today, -1);
    const y2 = addDays(today, -2);
    const logs = [log(today, "taken"), log(y1, "skipped"), log(y2, "taken")];
    const result = computeMedicationStreak(medication(), logs, today);
    expect(result.current).toBe(2); // today + y2, bridged by the paused y1
    expect(result.pausedToday).toBe(false);
  });

  it("today not yet logged pauses rather than breaks", () => {
    const today = todayLocal();
    const y1 = addDays(today, -1);
    const logs = [log(y1, "taken")]; // today has no log yet
    const result = computeMedicationStreak(medication(), logs, today);
    expect(result.current).toBe(1); // yesterday only
    expect(result.pausedToday).toBe(true);
  });

  it("8 consecutive skipped days (exceeding the cap) breaks the streak", () => {
    const today = todayLocal();
    const logs: MedicationLog[] = [];
    for (let i = 10; i >= 8; i--) logs.push(log(addDays(today, -i), "taken"));
    for (let i = 7; i >= 0; i--) logs.push(log(addDays(today, -i - 1), "skipped"));
    logs.push(log(today, "taken"));
    const result = computeMedicationStreak(medication(), logs, today);
    expect(MAX_CONSECUTIVE_PAUSE_DAYS).toBe(7);
    expect(result.current).toBe(1); // only today survives — the 8th skip broke the earlier run
  });

  it("exactly MAX_CONSECUTIVE_PAUSE_DAYS (7) consecutive skips does not trigger the cap", () => {
    const today = todayLocal();
    const logs: MedicationLog[] = [];
    for (let i = 10; i >= 8; i--) logs.push(log(addDays(today, -i), "taken"));
    for (let i = 7; i >= 1; i--) logs.push(log(addDays(today, -i), "skipped")); // exactly 7
    logs.push(log(today, "taken"));
    expect(computeMedicationStreak(medication(), logs, today).current).toBe(4);
  });

  it("days before startDate or after endDate are excluded, not counted as breaks", () => {
    const today = todayLocal();
    const start = addDays(today, -3);
    const med = medication({ startDate: start, endDate: today, durationDays: 4 });
    // Only 4 real days exist for this course; nothing before `start` can ever be scheduled.
    const logs = [log(start, "taken"), log(addDays(today, -2), "taken"), log(addDays(today, -1), "taken"), log(today, "taken")];
    expect(computeMedicationStreak(med, logs, today)).toEqual({ current: 4, pausedToday: false });
  });

  it("a day outside daysOfWeek is excluded, not counted as a break", () => {
    // Only Mondays (1) — any gap on a non-Monday must not break the streak.
    const med = medication({ daysOfWeek: [1], startDate: "2026-10-01", endDate: "2026-10-31" });
    // 2026-10-05 and 2026-10-12 are Mondays.
    const logs = [log("2026-10-05", "taken"), log("2026-10-12", "taken")];
    expect(computeMedicationStreak(med, logs, "2026-10-13").current).toBe(2);
  });
});
