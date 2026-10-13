import { describe, expect, it } from "vitest";
import { getMoonEventsInRange } from "./moonPhase";

describe("getMoonEventsInRange", () => {
  it("finds the new moon (Amavasya) and full moon (Purnima) within October 2026", () => {
    const events = getMoonEventsInRange(new Date(2026, 9, 1), new Date(2026, 10, 1));
    expect(events.get("2026-10-10")).toBe("amavasya");
    expect(events.get("2026-10-26")).toBe("purnima");
  });

  it("does not mark the first/third quarter days", () => {
    const events = getMoonEventsInRange(new Date(2026, 9, 1), new Date(2026, 10, 1));
    expect(events.get("2026-10-18")).toBeUndefined();
    expect(events.get("2026-10-03")).toBeUndefined();
  });

  it("returns no events for a range with no new/full moon", () => {
    const events = getMoonEventsInRange(new Date(2026, 9, 11), new Date(2026, 9, 17));
    expect(events.size).toBe(0);
  });
});
