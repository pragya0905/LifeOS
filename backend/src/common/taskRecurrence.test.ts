import { describe, expect, it } from "vitest";
import { computeNextOccurrence, isValidRecurrence } from "./taskRecurrence";

describe("computeNextOccurrence", () => {
  it("daily advances by one day from the due date", () => {
    expect(computeNextOccurrence({ frequency: "daily" }, "2026-10-15", "2026-10-15")).toBe("2026-10-16");
  });

  it("weekly finds the next matching day of week (Thu due date, Mon/Wed/Fri schedule)", () => {
    expect(
      computeNextOccurrence({ frequency: "weekly", daysOfWeek: [1, 3, 5] }, "2026-10-15", "2026-10-15"),
    ).toBe("2026-10-16"); // Fri
  });

  it("weekly with no daysOfWeek behaves like daily", () => {
    expect(computeNextOccurrence({ frequency: "weekly" }, "2026-10-15", "2026-10-15")).toBe("2026-10-16");
  });

  it("every_n_days adds the interval", () => {
    expect(
      computeNextOccurrence({ frequency: "every_n_days", intervalDays: 3 }, "2026-10-15", "2026-10-15"),
    ).toBe("2026-10-18");
  });

  it("monthly lands on the same day next month, clamped to the shorter month", () => {
    expect(computeNextOccurrence({ frequency: "monthly", dayOfMonth: 31 }, "2026-10-15", "2026-10-15")).toBe(
      "2026-11-30",
    );
  });

  it("monthly crosses a year boundary", () => {
    expect(computeNextOccurrence({ frequency: "monthly", dayOfMonth: 10 }, "2026-12-10", "2026-12-10")).toBe(
      "2027-01-10",
    );
  });

  it("a task completed well past its due date bases the next occurrence on today, not the stale due date", () => {
    expect(computeNextOccurrence({ frequency: "daily" }, "2026-10-01", "2026-10-15")).toBe("2026-10-16");
  });

  it("falls back to today when there's no due date at all", () => {
    expect(computeNextOccurrence({ frequency: "daily" }, undefined, "2026-10-15")).toBe("2026-10-16");
  });
});

describe("isValidRecurrence", () => {
  it("accepts a valid daily recurrence", () => {
    expect(isValidRecurrence({ frequency: "daily" })).toBe(true);
  });

  it("accepts a valid weekly recurrence with daysOfWeek", () => {
    expect(isValidRecurrence({ frequency: "weekly", daysOfWeek: [1, 3, 5] })).toBe(true);
  });

  it("rejects every_n_days without a valid intervalDays", () => {
    expect(isValidRecurrence({ frequency: "every_n_days" })).toBe(false);
    expect(isValidRecurrence({ frequency: "every_n_days", intervalDays: 0 })).toBe(false);
  });

  it("rejects monthly without a valid dayOfMonth", () => {
    expect(isValidRecurrence({ frequency: "monthly", dayOfMonth: 32 })).toBe(false);
  });

  it("rejects an unknown frequency", () => {
    expect(isValidRecurrence({ frequency: "yearly" })).toBe(false);
  });

  it("rejects a non-object value", () => {
    expect(isValidRecurrence("daily")).toBe(false);
    expect(isValidRecurrence(null)).toBe(false);
  });
});
