import { describe, expect, it, vi, afterEach } from "vitest";
import { toLocalDateStr, todayLocal } from "./date";

describe("toLocalDateStr", () => {
  it("formats the local calendar date with zero-padding", () => {
    expect(toLocalDateStr(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("does not shift to UTC the way toISOString().slice(0, 10) would", () => {
    // 11pm local time, east of UTC — toISOString() would roll this to the next UTC day.
    const date = new Date(2026, 9, 6, 23, 0, 0);
    expect(toLocalDateStr(date)).toBe("2026-10-06");
  });
});

describe("todayLocal", () => {
  afterEach(() => vi.useRealTimers());

  it("returns today's local date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 7, 1, 0, 0));
    expect(todayLocal()).toBe("2026-10-07");
  });
});
