import { describe, expect, it } from "vitest";
import { medicationStatusLabel, routineStatusLabel } from "./statusDisplay";

describe("routineStatusLabel", () => {
  it("labels done with no suffix", () => {
    expect(routineStatusLabel("done")).toBe("Done");
  });

  it("labels not_applicable plainly with no note, and skipped with warm default microcopy", () => {
    expect(routineStatusLabel("skipped")).toBe("Skipped — rest day");
    expect(routineStatusLabel("not_applicable")).toBe("N/A");
  });

  it("appends the note as a reason suffix when present", () => {
    expect(routineStatusLabel("skipped", "Sick")).toBe("Skipped — Sick");
    expect(routineStatusLabel("not_applicable", "Travelling")).toBe("N/A — Travelling");
  });
});

describe("medicationStatusLabel", () => {
  it("labels taken and missed", () => {
    expect(medicationStatusLabel("taken")).toBe("Taken");
    expect(medicationStatusLabel("missed")).toBe("Missed");
  });
});
