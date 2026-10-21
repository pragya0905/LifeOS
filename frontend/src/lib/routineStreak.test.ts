import { describe, expect, it } from "vitest";
import { computeRoutineStreak, STREAK_WINDOW_DAYS } from "./routineStreak";
import { todayLocal, addDays } from "./date";
import { MAX_CONSECUTIVE_PAUSE_DAYS } from "./streakEngine";
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

// Same test matrix as backend/src/common/streaks.test.ts and achievements.test.ts (translated
// to current-streak-only, since the frontend never computes best streak) — same inputs, same
// expected outcomes, so the two implementations can't silently drift apart.
describe("computeRoutineStreak", () => {
  it("is 0 when nothing has ever been logged (today's own unresolved steps pause rather than break it)", () => {
    expect(computeRoutineStreak(routine(["Step A", "Step B"]), new Map())).toEqual({ current: 0, pausedToday: true });
  });

  it("counts consecutive fully-done days, stopping at the first genuinely missing step", () => {
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
      // y2 stepIndex 1 never logged at all — a genuine gap, breaks the run here.
      { date: y3, stepIndex: 0, status: "done" },
      { date: y3, stepIndex: 1, status: "done" },
    ]);
    expect(computeRoutineStreak(routine(["Step A", "Step B"]), map)).toEqual({ current: 2, pausedToday: false }); // today + y1
  });

  it("treats not_applicable the same as done for advancing", () => {
    const today = todayLocal();
    const map = logsMap([
      { date: today, stepIndex: 0, status: "done" },
      { date: today, stepIndex: 1, status: "not_applicable" },
    ]);
    expect(computeRoutineStreak(routine(["Step A", "Step B"]), map)).toEqual({ current: 1, pausedToday: false });
  });

  it("does not break the streak just because today isn't finished yet (unresolved step)", () => {
    const today = todayLocal();
    const y1 = addDays(today, -1);
    const map = logsMap([
      { date: today, stepIndex: 0, status: "done" }, // step 1 not logged yet today — pauses, not breaks
      { date: y1, stepIndex: 0, status: "done" },
      { date: y1, stepIndex: 1, status: "done" },
    ]);
    const result = computeRoutineStreak(routine(["Step A", "Step B"]), map);
    expect(result.current).toBe(1); // yesterday only — today's unresolved step doesn't add, doesn't break
    expect(result.pausedToday).toBe(true);
  });

  it("all steps skipped pauses the streak instead of breaking it", () => {
    const today = todayLocal();
    const y1 = addDays(today, -1);
    const y2 = addDays(today, -2);
    const map = logsMap([
      { date: y2, stepIndex: 0, status: "done" },
      { date: y1, stepIndex: 0, status: "skipped" }, // pause — bridges without adding
      { date: today, stepIndex: 0, status: "done" },
    ]);
    const result = computeRoutineStreak(routine(["Step A"]), map);
    expect(result.current).toBe(2); // y2 + today, bridged by the paused y1 (which doesn't itself count)
    expect(result.pausedToday).toBe(false); // today is resolved (done), not a pause
  });

  it("all steps N/A pauses the streak the same as all-skipped", () => {
    const today = todayLocal();
    const y1 = addDays(today, -1);
    const y2 = addDays(today, -2);
    const map = logsMap([
      { date: y2, stepIndex: 0, status: "done" },
      { date: y1, stepIndex: 0, status: "not_applicable" },
      { date: today, stepIndex: 0, status: "done" },
    ]);
    expect(computeRoutineStreak(routine(["Step A"]), map).current).toBe(2);
  });

  it("mixed Done+Skipped+N-A with nothing unresolved advances the day fully", () => {
    const today = todayLocal();
    const map = logsMap([
      { date: today, stepIndex: 0, status: "done" },
      { date: today, stepIndex: 1, status: "skipped" },
      { date: today, stepIndex: 2, status: "not_applicable" },
    ]);
    expect(computeRoutineStreak(routine(["A", "B", "C"]), map).current).toBe(1);
  });

  it("a skipped day immediately followed by a genuinely missing day breaks the streak", () => {
    const today = todayLocal(); // treat as the missing day (no log at all for it)
    const y1 = addDays(today, -1); // skipped
    const y2 = addDays(today, -2);
    const y3 = addDays(today, -3);
    const map = logsMap([
      { date: y3, stepIndex: 0, status: "done" },
      { date: y2, stepIndex: 0, status: "done" },
      { date: y1, stepIndex: 0, status: "skipped" },
      // today: nothing logged — but today never breaks, so this pauses instead.
    ]);
    const result = computeRoutineStreak(routine(["Step A"]), map);
    expect(result.current).toBe(2); // y3 + y2
    expect(result.pausedToday).toBe(true);
  });

  it("8 consecutive pause days (exceeding the cap) breaks the streak even though each day alone is forgiven", () => {
    const today = todayLocal();
    const entries: { date: string; stepIndex: number; status: RoutineStepLog["status"] }[] = [];
    // Build from oldest to newest: 3 done days, then 8 consecutive skipped days ending at
    // today - 1 (so today itself isn't part of the pause run being tested).
    for (let i = 10; i >= 8; i--) entries.push({ date: addDays(today, -i), stepIndex: 0, status: "done" });
    for (let i = 7; i >= 0; i--) entries.push({ date: addDays(today, -i - 1), stepIndex: 0, status: "skipped" });
    entries.push({ date: today, stepIndex: 0, status: "done" });
    const result = computeRoutineStreak(routine(["Step A"]), logsMap(entries));
    // The 8th consecutive skip (MAX_CONSECUTIVE_PAUSE_DAYS + 1) converts to a break, resetting
    // everything before it — only today's single done day survives as the current streak.
    expect(MAX_CONSECUTIVE_PAUSE_DAYS).toBe(7);
    expect(result.current).toBe(1);
    expect(result.pausedToday).toBe(false);
  });

  it("exactly MAX_CONSECUTIVE_PAUSE_DAYS (7) consecutive pauses does not trigger the cap", () => {
    const today = todayLocal();
    const entries: { date: string; stepIndex: number; status: RoutineStepLog["status"] }[] = [];
    for (let i = 10; i >= 8; i--) entries.push({ date: addDays(today, -i), stepIndex: 0, status: "done" });
    for (let i = 7; i >= 1; i--) entries.push({ date: addDays(today, -i), stepIndex: 0, status: "skipped" }); // exactly 7
    entries.push({ date: today, stepIndex: 0, status: "done" });
    const result = computeRoutineStreak(routine(["Step A"]), logsMap(entries));
    expect(result.current).toBe(4); // 3 done + today, bridged intact by exactly 7 pauses
  });

  it("window is bounded to STREAK_WINDOW_DAYS (30)", () => {
    expect(STREAK_WINDOW_DAYS).toBe(30);
  });
});
