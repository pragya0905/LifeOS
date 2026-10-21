import { describe, expect, it } from "vitest";
import { computeEligibleBadgeKeys, type AchievementInputs } from "./achievements";
import type { HabitLog, Medication, MedicationLog, RoutineStepLog, RoutineTemplate, Wish } from "./types";

// Minimal valid base — every test overrides only what it cares about, via spread, so adding a
// required field to one of these types later doesn't force every test to be rewritten.
const BASE_INPUTS: AchievementInputs = {
  doneTasks: 0,
  journalEntries: 0,
  habitLogs: [],
  routineLogsDone: 0,
  routineLogs: [],
  routines: [],
  medicationLogsTaken: 0,
  medicationLogs: [],
  medications: [],
  wishes: [],
};

function habitLog(date: string, value = 1000): HabitLog {
  return {
    userId: "u1",
    dateHabitType: `${date}#water`,
    date,
    habitType: "water",
    status: "done",
    value,
    source: "manual",
    createdAt: date,
    updatedAt: date,
  };
}

// Real, relative to whenever the suite actually runs — not a fixed 2026 date. The streak
// engine now scans from a routine/medication's createdAt/startDate through the real "today",
// so a hardcoded historical date range would accumulate an ever-growing run of genuinely-
// unresolved (break) days after the fixture's last log as calendar time passes, which doesn't
// affect `best` (it's already recorded before the gap) but does make `current` meaningless and
// bloats iteration counts pointlessly. Dynamic dates keep every test both correct and fast
// regardless of when it's run.
function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function routine(routineId: string, steps: string[], createdAt = daysAgo(90)): RoutineTemplate {
  return { userId: "u1", routineId, category: "custom", name: "Test routine", steps, createdAt };
}

function routineLog(
  date: string,
  routineId: string,
  stepIndex: number,
  status: "done" | "skipped" | "not_applicable" = "done",
): RoutineStepLog {
  return {
    userId: "u1",
    dateRoutineStep: `${date}#${routineId}#${stepIndex}`,
    date,
    routineId,
    stepIndex,
    status,
    source: "manual",
    createdAt: date,
    updatedAt: date,
  };
}

function medication(medicationId: string, startDate: string, durationDays: number): Medication {
  return { userId: "u1", medicationId, name: "Test Med", startDate, durationDays, createdAt: "2026-01-01" };
}

function medicationLog(date: string, medicationId: string, status: "taken" | "missed" | "skipped" = "taken"): MedicationLog {
  return {
    userId: "u1",
    dateMedicationId: `${date}#${medicationId}`,
    date,
    medicationId,
    status,
    source: "manual",
    createdAt: date,
    updatedAt: date,
  };
}

function wish(status: Wish["status"] = "active"): Wish {
  return {
    userId: "u1",
    wishId: "w1",
    title: "Test wish",
    type: "personal_growth",
    progressMode: "percentage",
    status,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

describe("computeEligibleBadgeKeys — tasks", () => {
  it("earns nothing with zero done tasks", () => {
    expect(computeEligibleBadgeKeys(BASE_INPUTS).has("first-task")).toBe(false);
  });
  it("earns first-task at 1, task-master at 10, task-champion at 50", () => {
    expect(computeEligibleBadgeKeys({ ...BASE_INPUTS, doneTasks: 1 }).has("first-task")).toBe(true);
    const at9 = computeEligibleBadgeKeys({ ...BASE_INPUTS, doneTasks: 9 });
    expect(at9.has("first-task")).toBe(true);
    expect(at9.has("task-master")).toBe(false);
    expect(computeEligibleBadgeKeys({ ...BASE_INPUTS, doneTasks: 10 }).has("task-master")).toBe(true);
    const at49 = computeEligibleBadgeKeys({ ...BASE_INPUTS, doneTasks: 49 });
    expect(at49.has("task-champion")).toBe(false);
    expect(computeEligibleBadgeKeys({ ...BASE_INPUTS, doneTasks: 50 }).has("task-champion")).toBe(true);
  });
});

describe("computeEligibleBadgeKeys — journal", () => {
  it("earns journaler at 5, journal-habit at 30", () => {
    expect(computeEligibleBadgeKeys({ ...BASE_INPUTS, journalEntries: 4 }).has("journaler")).toBe(false);
    expect(computeEligibleBadgeKeys({ ...BASE_INPUTS, journalEntries: 5 }).has("journaler")).toBe(true);
    expect(computeEligibleBadgeKeys({ ...BASE_INPUTS, journalEntries: 29 }).has("journal-habit")).toBe(false);
    expect(computeEligibleBadgeKeys({ ...BASE_INPUTS, journalEntries: 30 }).has("journal-habit")).toBe(true);
  });
});

describe("computeEligibleBadgeKeys — habit streaks", () => {
  it("6 consecutive days does not earn streak-3... wait, does earn streak-3 but not streak-7", () => {
    const logs = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"].map((d) =>
      habitLog(d),
    );
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, habitLogs: logs });
    expect(result.has("streak-3")).toBe(true);
    expect(result.has("streak-7")).toBe(false);
  });

  it("7 consecutive days earns streak-7 but not streak-30", () => {
    const dates = Array.from({ length: 7 }, (_, i) => `2026-10-0${i + 1}`);
    const logs = dates.map((d) => habitLog(d));
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, habitLogs: logs });
    expect(result.has("streak-7")).toBe(true);
    expect(result.has("streak-30")).toBe(false);
  });

  it("a gap breaks the streak — 3 days, skip a day, 3 more days does not earn streak-7", () => {
    const logs = [
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      // gap on 2026-10-04
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
    ].map((d) => habitLog(d));
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, habitLogs: logs });
    expect(result.has("streak-7")).toBe(false);
    expect(result.has("streak-3")).toBe(true);
  });

  it("a logged habit with value 0 does not count as an active day", () => {
    const logs = [habitLog("2026-10-01", 0), habitLog("2026-10-02", 0), habitLog("2026-10-03", 0)];
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, habitLogs: logs });
    expect(result.has("streak-3")).toBe(false);
  });
});

describe("computeEligibleBadgeKeys — routine streaks (forgiving: skipped/N-A pause, don't break)", () => {
  it("6 consecutive fully-done days does not earn routine-consistent", () => {
    const r = routine("r1", ["Step A", "Step B"]);
    const logs: RoutineStepLog[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = daysAgo(i);
      logs.push(routineLog(d, "r1", 0), routineLog(d, "r1", 1));
    }
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, routines: [r], routineLogs: logs });
    expect(result.has("routine-consistent")).toBe(false);
  });

  it("7 consecutive fully-done days earns routine-consistent", () => {
    const r = routine("r1", ["Step A", "Step B"]);
    const logs: RoutineStepLog[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = daysAgo(i);
      logs.push(routineLog(d, "r1", 0), routineLog(d, "r1", 1));
    }
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, routines: [r], routineLogs: logs });
    expect(result.has("routine-consistent")).toBe(true);
  });

  it("a day with only some steps logged breaks the day (unresolved step), even across 7 days", () => {
    const r = routine("r1", ["Step A", "Step B"]);
    const logs: RoutineStepLog[] = [];
    for (let i = 6; i >= 0; i--) {
      logs.push(routineLog(daysAgo(i), "r1", 0)); // only step 0, never step 1
    }
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, routines: [r], routineLogs: logs });
    expect(result.has("routine-consistent")).toBe(false);
  });

  it("not_applicable steps count toward a fully-done day, same as done", () => {
    const r = routine("r1", ["Step A", "Step B"]);
    const logs: RoutineStepLog[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = daysAgo(i);
      logs.push(routineLog(d, "r1", 0, "done"), routineLog(d, "r1", 1, "not_applicable"));
    }
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, routines: [r], routineLogs: logs });
    expect(result.has("routine-consistent")).toBe(true);
  });

  it("a day where every step is skipped PAUSES the streak instead of breaking it — the forgiving rule", () => {
    const r = routine("r1", ["Step A"]);
    const logs: RoutineStepLog[] = [];
    // 3 done days, 1 fully-skipped day (should pause, not break), 4 more done days = 7 advancing days total.
    for (let i = 7; i >= 4; i--) logs.push(routineLog(daysAgo(i), "r1", 0, "done"));
    logs.push(routineLog(daysAgo(3), "r1", 0, "skipped"));
    for (let i = 2; i >= 0; i--) logs.push(routineLog(daysAgo(i), "r1", 0, "done"));
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, routines: [r], routineLogs: logs });
    expect(result.has("routine-consistent")).toBe(true);
  });

  it("a mixed Done+Skipped day with nothing unresolved still advances (every step accounted for, at least one done)", () => {
    const r = routine("r1", ["Step A", "Step B", "Step C"]);
    const logs: RoutineStepLog[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = daysAgo(i);
      logs.push(routineLog(d, "r1", 0, "done"), routineLog(d, "r1", 1, "skipped"), routineLog(d, "r1", 2, "not_applicable"));
    }
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, routines: [r], routineLogs: logs });
    expect(result.has("routine-consistent")).toBe(true);
  });

  it("a genuinely missing (never logged) day still breaks the streak — forgiveness is for skipped/N-A, not silence", () => {
    const r = routine("r1", ["Step A"]);
    const logs: RoutineStepLog[] = [];
    for (let i = 7; i >= 4; i--) logs.push(routineLog(daysAgo(i), "r1", 0, "done"));
    // daysAgo(3) has no log at all — a real gap, not an explicit skip.
    for (let i = 2; i >= 0; i--) logs.push(routineLog(daysAgo(i), "r1", 0, "done"));
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, routines: [r], routineLogs: logs });
    expect(result.has("routine-consistent")).toBe(false);
  });

  it("8 consecutive fully-skipped days breaks the streak (pause cap) even though each individual day is forgiven, but best stays recorded", () => {
    const r = routine("r1", ["Step A"]);
    const logs: RoutineStepLog[] = [];
    // 7 done days first (establishes best=7), then 8 consecutive skip days — day 8 of the skip
    // run exceeds MAX_CONSECUTIVE_PAUSE_DAYS (7) and converts to a break.
    for (let i = 14; i >= 8; i--) logs.push(routineLog(daysAgo(i), "r1", 0, "done"));
    for (let i = 7; i >= 0; i--) logs.push(routineLog(daysAgo(i), "r1", 0, "skipped"));
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, routines: [r], routineLogs: logs });
    // routine-consistent is a `best >= 7` check, and best (7, from the earlier done run) was
    // already recorded before the later pause-cap break — still earns it.
    expect(result.has("routine-consistent")).toBe(true);
  });

  it("per-item, not unioned: a user alternating between two different routines day-to-day does NOT earn routine-consistent, even though a day is 'complete' every day", () => {
    const rA = routine("rA", ["Step A"]);
    const rB = routine("rB", ["Step A"]);
    const logs: RoutineStepLog[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = daysAgo(i);
      // Alternate which routine gets done each day — under the OLD union rule this would count
      // every day; under the new per-item rule, neither routine individually has a 7-day run.
      logs.push(routineLog(d, i % 2 === 0 ? "rA" : "rB", 0, "done"));
    }
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, routines: [rA, rB], routineLogs: logs });
    expect(result.has("routine-consistent")).toBe(false);
  });

  it("routine-starter earns on a single done step, regardless of streak", () => {
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, routineLogsDone: 1 });
    expect(result.has("routine-starter")).toBe(true);
    expect(result.has("routine-consistent")).toBe(false);
  });
});

describe("computeEligibleBadgeKeys — medication streaks (forgiving: skipped pauses, missed still breaks)", () => {
  it("6 consecutive taken days does not earn medication-consistent", () => {
    const m = medication("m1", daysAgo(90), 180);
    const logs = Array.from({ length: 6 }, (_, i) => medicationLog(daysAgo(5 - i), "m1"));
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, medications: [m], medicationLogs: logs });
    expect(result.has("medication-consistent")).toBe(false);
  });

  it("7 consecutive taken days earns medication-consistent", () => {
    const m = medication("m1", daysAgo(90), 180);
    const logs = Array.from({ length: 7 }, (_, i) => medicationLog(daysAgo(6 - i), "m1"));
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, medications: [m], medicationLogs: logs });
    expect(result.has("medication-consistent")).toBe(true);
  });

  it("a day only requires medications active THAT DAY (own per-item streak, not a union across medications)", () => {
    const m1 = medication("m1", daysAgo(90), 180);
    const m2 = medication("m2", daysAgo(2), 30); // only becomes active 2 days ago
    const logs: MedicationLog[] = [];
    for (let i = 6; i >= 0; i--) logs.push(medicationLog(daysAgo(i), "m1"));
    for (let i = 2; i >= 0; i--) logs.push(medicationLog(daysAgo(i), "m2"));
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, medications: [m1, m2], medicationLogs: logs });
    // m1 alone has a real 7-day streak; it doesn't matter that m2 only has 3 days of history.
    expect(result.has("medication-consistent")).toBe(true);
  });

  it("a missing dose (never logged) on an active day breaks the streak", () => {
    const m1 = medication("m1", daysAgo(90), 180);
    const logs: MedicationLog[] = [];
    for (let i = 6; i >= 4; i--) logs.push(medicationLog(daysAgo(i), "m1"));
    // daysAgo(3) never logged — a real gap.
    for (let i = 2; i >= 0; i--) logs.push(medicationLog(daysAgo(i), "m1"));
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, medications: [m1], medicationLogs: logs });
    expect(result.has("medication-consistent")).toBe(false);
  });

  it("an explicit Missed log breaks the streak, same as a never-logged gap", () => {
    const m1 = medication("m1", daysAgo(90), 180);
    const logs: MedicationLog[] = [];
    for (let i = 6; i >= 4; i--) logs.push(medicationLog(daysAgo(i), "m1", "taken"));
    logs.push(medicationLog(daysAgo(3), "m1", "missed"));
    for (let i = 2; i >= 0; i--) logs.push(medicationLog(daysAgo(i), "m1", "taken"));
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, medications: [m1], medicationLogs: logs });
    expect(result.has("medication-consistent")).toBe(false);
  });

  it("a Skipped day pauses instead of breaking — the forgiving rule (a pause doesn't itself add to the count, so this needs 7 TAKEN days bridged by one skip, not 7 calendar days including the skip)", () => {
    const m1 = medication("m1", daysAgo(90), 180);
    const logs: MedicationLog[] = [];
    for (let i = 7; i >= 4; i--) logs.push(medicationLog(daysAgo(i), "m1", "taken")); // 4 taken
    logs.push(medicationLog(daysAgo(3), "m1", "skipped")); // pause, bridges without adding
    for (let i = 2; i >= 0; i--) logs.push(medicationLog(daysAgo(i), "m1", "taken")); // 3 more taken = 7 total
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, medications: [m1], medicationLogs: logs });
    expect(result.has("medication-consistent")).toBe(true);
  });

  it("days before a medication's startDate or after its endDate are excluded, not treated as breaks", () => {
    // A 5-day course starting 3 days ago (ends in 1 day) — only its own narrow window should
    // ever be scanned; nothing before startDate or after endDate should count against it.
    const start = daysAgo(3);
    const m1 = medication("m1", start, 5);
    const logs = [medicationLog(daysAgo(3), "m1"), medicationLog(daysAgo(2), "m1"), medicationLog(daysAgo(1), "m1"), medicationLog(daysAgo(0), "m1")];
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, medications: [m1], medicationLogs: logs });
    // Only 4 days of real history exist (course started 3 days ago) — not enough for 7, but
    // critically this must not throw or wrongly scan days before `start`.
    expect(result.has("medication-consistent")).toBe(false);
  });
});

describe("computeEligibleBadgeKeys — wishes", () => {
  it("earns first-wish on any wish, wish-achiever only on a completed one", () => {
    const activeOnly = computeEligibleBadgeKeys({ ...BASE_INPUTS, wishes: [wish("active")] });
    expect(activeOnly.has("first-wish")).toBe(true);
    expect(activeOnly.has("wish-achiever")).toBe(false);

    const completed = computeEligibleBadgeKeys({ ...BASE_INPUTS, wishes: [wish("completed")] });
    expect(completed.has("wish-achiever")).toBe(true);
  });
});
