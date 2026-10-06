import { describe, expect, it } from "vitest";
import { formatSchedule } from "./weekdays";

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
