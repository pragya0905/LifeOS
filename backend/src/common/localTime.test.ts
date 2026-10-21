import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localNow, parseTimezoneOffsetMinutes, today } from "./localTime";

describe("today / localNow", () => {
  beforeEach(() => {
    // 2026-10-20T20:00:00Z — chosen so IST (UTC+5:30, offset -330) has already rolled over
    // to 2026-10-21 while UTC itself is still on 2026-10-20, pinning the exact bug this
    // module exists to fix.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T20:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("offset -330 (IST) at 2026-10-20T20:00:00Z gives 2026-10-21", () => {
    expect(today(-330)).toBe("2026-10-21");
  });

  it("offset 0 gives the UTC date", () => {
    expect(today(0)).toBe("2026-10-20");
  });

  it("undefined offset falls back to the UTC date", () => {
    expect(today(undefined)).toBe("2026-10-20");
    expect(today()).toBe("2026-10-20");
  });

  it("localNow(-330) is 2026-10-21T01:30:00Z (UTC - offsetMinutes)", () => {
    expect(localNow(-330).toISOString()).toBe("2026-10-21T01:30:00.000Z");
  });
});

describe("parseTimezoneOffsetMinutes", () => {
  it("accepts a plain finite number", () => {
    expect(parseTimezoneOffsetMinutes(-330)).toBe(-330);
    expect(parseTimezoneOffsetMinutes(0)).toBe(0);
    expect(parseTimezoneOffsetMinutes(840)).toBe(840);
    expect(parseTimezoneOffsetMinutes(-840)).toBe(-840);
  });

  it("accepts a numeric string (query params arrive as strings)", () => {
    expect(parseTimezoneOffsetMinutes("-330")).toBe(-330);
  });

  it("falls back to undefined (UTC) for anything invalid, never throws", () => {
    expect(parseTimezoneOffsetMinutes(undefined)).toBeUndefined();
    expect(parseTimezoneOffsetMinutes(null)).toBeUndefined();
    expect(parseTimezoneOffsetMinutes("")).toBeUndefined();
    expect(parseTimezoneOffsetMinutes("not-a-number")).toBeUndefined();
    expect(parseTimezoneOffsetMinutes(NaN)).toBeUndefined();
    expect(parseTimezoneOffsetMinutes(Infinity)).toBeUndefined();
    expect(parseTimezoneOffsetMinutes({})).toBeUndefined();
    expect(parseTimezoneOffsetMinutes([])).toBeUndefined();
  });

  it("falls back to undefined for out-of-range values (beyond the real-world ±14h UTC offset range)", () => {
    expect(parseTimezoneOffsetMinutes(841)).toBeUndefined();
    expect(parseTimezoneOffsetMinutes(-841)).toBeUndefined();
    expect(parseTimezoneOffsetMinutes(100000)).toBeUndefined();
  });

  it("accepts the exact boundary values", () => {
    expect(parseTimezoneOffsetMinutes(840)).toBe(840);
    expect(parseTimezoneOffsetMinutes(-840)).toBe(-840);
  });
});
