import { describe, expect, it } from "vitest";
import { computeEndDate, isMedicationActiveOnDate } from "./medications";

describe("computeEndDate", () => {
  it("a 1-day duration ends on the same day it starts", () => {
    expect(computeEndDate("2026-10-06", 1)).toBe("2026-10-06");
  });

  it("a 30-day duration starting Oct 6 ends Nov 4 (inclusive counting)", () => {
    expect(computeEndDate("2026-10-06", 30)).toBe("2026-11-04");
  });

  it("correctly crosses a year boundary", () => {
    expect(computeEndDate("2026-12-20", 15)).toBe("2027-01-03");
  });
});

describe("isMedicationActiveOnDate", () => {
  const base = { startDate: "2026-10-06", durationDays: 30 }; // range 2026-10-06..2026-11-04

  it("with no daysOfWeek set, active on every day within the date range", () => {
    expect(isMedicationActiveOnDate(base, "2026-10-06")).toBe(true);
    expect(isMedicationActiveOnDate(base, "2026-10-12")).toBe(true);
    expect(isMedicationActiveOnDate(base, "2026-11-04")).toBe(true);
  });

  it("an empty daysOfWeek array means every day, same as undefined", () => {
    expect(isMedicationActiveOnDate({ ...base, daysOfWeek: [] }, "2026-10-12")).toBe(true);
  });

  it("never active before startDate or after the computed end date, regardless of daysOfWeek", () => {
    expect(isMedicationActiveOnDate(base, "2026-10-05")).toBe(false);
    expect(isMedicationActiveOnDate(base, "2026-11-05")).toBe(false);
  });

  it("a weekly medication (Sunday only) is active on Sundays within range, not other days", () => {
    const weekly = { ...base, daysOfWeek: [0] }; // 2026-10-11 is a Sunday, 2026-10-12 a Monday
    expect(isMedicationActiveOnDate(weekly, "2026-10-11")).toBe(true);
    expect(isMedicationActiveOnDate(weekly, "2026-10-12")).toBe(false);
  });

  it("a weekly medication's schedule still obeys the date range even on a matching weekday", () => {
    // 2026-11-08 is also a Sunday, but past the 30-day duration ending 2026-11-04.
    const weekly = { ...base, daysOfWeek: [0] };
    expect(isMedicationActiveOnDate(weekly, "2026-11-08")).toBe(false);
  });
});
