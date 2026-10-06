import { describe, expect, it } from "vitest";
import { computeEndDate } from "./medications";

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
