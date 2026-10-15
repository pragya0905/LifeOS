import { describe, expect, it } from "vitest";
import { computeRoutineStreak } from "./routineStreak";
import { todayLocal, addDays } from "./date";
import type { RoutineStepLog, RoutineTemplate } from "../types";

function routine(steps: string[]): RoutineTemplate {
  return {
    userId: "u1",
    routineId: "r1",
    category: "dailyRoutine",
    name: "Morning",
    steps,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

function logsMap(entries: { date: string; stepIndex: number; status: RoutineStepLog["status"] }[]): Map<string, RoutineStepLog["status"]> {
  const map = new Map<string, RoutineStepLog["status"]>();
  for (const e of entries) map.set(`${e.date}#r1#${e.stepIndex}`, e.status);
  return map;
}

describe("computeRoutineStreak", () => {
  it("is 0 when nothing has ever been logged", () => {
    expect(computeRoutineStreak(routine(["Step A", "Step B"]), new Map())).toBe(0);
  });

  it("counts consecutive fully-done days, stopping at the first gap", () => {
    const today = todayLocal();
    const y1 = addDays(today, -1);
    const y2 = addDays(today, -2);
    const y3 = addDays(today, -3);
    const map = logsMap([
      { date: today, stepIndex: 0, status: "done" },
      { date: today, stepIndex: 1, status: "done" },
      { date: y1, stepIndex: 0, status: "done" },
      { date: y1, stepIndex: 1, status: "done" },
      { date: y2, stepIndex: 0, status: "done" },
      { date: y2, stepIndex: 1, status: "skipped" }, // breaks the streak here
      { date: y3, stepIndex: 0, status: "done" },
      { date: y3, stepIndex: 1, status: "done" },
    ]);
    expect(computeRoutineStreak(routine(["Step A", "Step B"]), map)).toBe(2); // today + y1
  });

  it("treats not_applicable the same as done", () => {
    const today = todayLocal();
    const map = logsMap([
      { date: today, stepIndex: 0, status: "done" },
      { date: today, stepIndex: 1, status: "not_applicable" },
    ]);
    expect(computeRoutineStreak(routine(["Step A", "Step B"]), map)).toBe(1);
  });

  it("does not break the streak just because today isn't finished yet", () => {
    const today = todayLocal();
    const y1 = addDays(today, -1);
    const map = logsMap([
      { date: today, stepIndex: 0, status: "done" }, // step 1 not logged yet today
      { date: y1, stepIndex: 0, status: "done" },
      { date: y1, stepIndex: 1, status: "done" },
    ]);
    expect(computeRoutineStreak(routine(["Step A", "Step B"]), map)).toBe(1); // yesterday only
  });
});
