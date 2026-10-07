import { describe, expect, it } from "vitest";
import { appliesOnDate, formatSchedule } from "./weekdays";

describe("formatSchedule", () => {
  it("renders 'Daily' when undefined, empty, or all 7 days", () => {
    expect(formatSchedule(undefined)).toBe("Daily");
    expect(formatSchedule([])).toBe("Daily");
    expect(formatSchedule([0, 1, 2, 3, 4, 5, 6])).toBe("Daily");
  });

  it("sorts days regardless of input order", () => {
    expect(formatSchedule([5, 1, 3])).toBe("Mon, Wed, Fri");
  });

  it("does not mutate the input array", () => {
    const days = [5, 1, 3];
    formatSchedule(days);
    expect(days).toEqual([5, 1, 3]);
  });
});

describe("appliesOnDate", () => {
  // Local-time constructor (not UTC) so the test's assumed weekday holds regardless of the
  // machine's timezone — 2026-10-11 is a Sunday, 2026-10-12 a Monday.
  const sunday = new Date(2026, 9, 11);
  const monday = new Date(2026, 9, 12);

  it("undefined or empty daysOfWeek applies every day", () => {
    expect(appliesOnDate(undefined, sunday)).toBe(true);
    expect(appliesOnDate([], monday)).toBe(true);
  });

  it("only applies on a day actually listed", () => {
    expect(appliesOnDate([0], sunday)).toBe(true);
    expect(appliesOnDate([0], monday)).toBe(false);
  });
});
