import { describe, expect, it } from "vitest";
import { hoursUntilDue, isSlackExhausted } from "./tasks";

describe("hoursUntilDue", () => {
  it("prefers dueAtUtc when present", () => {
    const now = new Date("2026-10-15T10:00:00.000Z");
    const result = hoursUntilDue({ dueAtUtc: "2026-10-15T13:00:00.000Z" }, now);
    expect(result).toBeCloseTo(3, 5);
  });

  it("falls back to dueDate/dueTime when dueAtUtc is absent", () => {
    // Parsed without a "Z" suffix, so this resolves in whatever timezone the process runs
    // in (the same ambiguity the function's own doc comment calls out) — compute the
    // expectation the identical way rather than assuming a fixed offset, so this test
    // passes regardless of the machine/CI runner's local timezone.
    const now = new Date("2026-10-15T10:00:00.000Z");
    const expectedDue = new Date("2026-10-15T13:00:00");
    const result = hoursUntilDue({ dueDate: "2026-10-15", dueTime: "13:00" }, now);
    expect(result).toBeCloseTo((expectedDue.getTime() - now.getTime()) / (1000 * 60 * 60), 5);
  });

  it("returns undefined with no due date at all", () => {
    expect(hoursUntilDue({}, new Date())).toBeUndefined();
  });
});

describe("isSlackExhausted", () => {
  it("is false when there's no estimate", () => {
    const now = new Date("2026-10-15T10:00:00.000Z");
    expect(isSlackExhausted({ dueAtUtc: "2026-10-15T11:00:00.000Z" }, now)).toBe(false);
  });

  it("is true once remaining time no longer exceeds the estimate", () => {
    const now = new Date("2026-10-15T10:00:00.000Z");
    expect(isSlackExhausted({ dueAtUtc: "2026-10-15T11:00:00.000Z", estimatedHours: 2 }, now)).toBe(true);
  });

  it("is false with ample remaining slack", () => {
    const now = new Date("2026-10-15T10:00:00.000Z");
    expect(isSlackExhausted({ dueAtUtc: "2026-10-16T10:00:00.000Z", estimatedHours: 2 }, now)).toBe(false);
  });

  it("is true for an already-overdue task with an estimate", () => {
    const now = new Date("2026-10-15T10:00:00.000Z");
    expect(isSlackExhausted({ dueAtUtc: "2026-10-14T10:00:00.000Z", estimatedHours: 2 }, now)).toBe(true);
  });
});
