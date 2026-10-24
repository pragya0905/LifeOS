import { describe, expect, it } from "vitest";
import { isValidTimeOfDay } from "./timeOfDay";

describe("isValidTimeOfDay", () => {
  it("accepts every valid HH:MM, including the boundaries", () => {
    expect(isValidTimeOfDay("00:00")).toBe(true);
    expect(isValidTimeOfDay("23:59")).toBe(true);
    expect(isValidTimeOfDay("09:30")).toBe(true);
    expect(isValidTimeOfDay("12:00")).toBe(true);
  });

  it("rejects an out-of-range hour or minute, even though it matches digit-digit:digit-digit", () => {
    expect(isValidTimeOfDay("25:99")).toBe(false);
    expect(isValidTimeOfDay("24:00")).toBe(false);
    expect(isValidTimeOfDay("12:60")).toBe(false);
    expect(isValidTimeOfDay("99:99")).toBe(false);
  });

  it("rejects malformed strings and non-strings", () => {
    expect(isValidTimeOfDay("9:30")).toBe(false);
    expect(isValidTimeOfDay("09:3")).toBe(false);
    expect(isValidTimeOfDay("0930")).toBe(false);
    expect(isValidTimeOfDay("")).toBe(false);
    expect(isValidTimeOfDay(undefined)).toBe(false);
    expect(isValidTimeOfDay(930)).toBe(false);
    expect(isValidTimeOfDay(null)).toBe(false);
  });
});
