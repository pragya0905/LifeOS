import { describe, expect, it } from "vitest";
import { checkBlockType, checkEndTime, checkStepMinutes } from "./timelineFields";

describe("checkEndTime", () => {
  it("accepts HH:MM and rejects anything else", () => {
    expect(checkEndTime("07:15")).toBeNull();
    expect(checkEndTime("7:15")).not.toBeNull();
    expect(checkEndTime(715)).not.toBeNull();
    expect(checkEndTime(undefined)).not.toBeNull();
  });
});

describe("checkStepMinutes", () => {
  it("accepts whole minutes, one per step", () => {
    expect(checkStepMinutes([2, 5, 10], 3)).toBeNull();
  });

  it("rejects fractional, zero, negative and non-numeric entries", () => {
    expect(checkStepMinutes([1.5, 2], 2)).not.toBeNull();
    expect(checkStepMinutes([0, 2], 2)).not.toBeNull();
    expect(checkStepMinutes([-3, 2], 2)).not.toBeNull();
    expect(checkStepMinutes(["5", 2], 2)).not.toBeNull();
    expect(checkStepMinutes("5,2", 2)).not.toBeNull();
  });

  it("rejects a list whose length doesn't match the steps", () => {
    expect(checkStepMinutes([5], 2)).toBe("stepMinutes must have one entry per step");
  });

  it("accepts any length when the step count isn't known", () => {
    expect(checkStepMinutes([5])).toBeNull();
  });
});

describe("checkBlockType", () => {
  it("accepts task and protected only", () => {
    expect(checkBlockType("task")).toBeNull();
    expect(checkBlockType("protected")).toBeNull();
    expect(checkBlockType("meeting")).not.toBeNull();
    expect(checkBlockType(undefined)).not.toBeNull();
  });
});
