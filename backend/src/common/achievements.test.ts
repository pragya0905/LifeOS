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

function routine(routineId: string, steps: string[]): RoutineTemplate {
  return { userId: "u1", routineId, category: "custom", name: "Test routine", steps, createdAt: "2026-01-01" };
}

function routineLog(date: string, routineId: string, stepIndex: number, status: "done" | "skipped" = "done"): RoutineStepLog {
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

function medicationLog(date: string, medicationId: string, status: "taken" | "missed" = "taken"): MedicationLog {
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

describe("computeEligibleBadgeKeys — routine streaks", () => {
  it("6 consecutive fully-completed days does not earn routine-consistent", () => {
    const r = routine("r1", ["Step A", "Step B"]);
    const logs: RoutineStepLog[] = [];
    for (let i = 1; i <= 6; i++) {
      const d = `2026-10-0${i}`;
      logs.push(routineLog(d, "r1", 0), routineLog(d, "r1", 1));
    }
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, routines: [r], routineLogs: logs });
    expect(result.has("routine-consistent")).toBe(false);
  });

  it("7 consecutive fully-completed days earns routine-consistent", () => {
    const r = routine("r1", ["Step A", "Step B"]);
    const logs: RoutineStepLog[] = [];
    for (let i = 1; i <= 7; i++) {
      const d = `2026-10-0${i}`;
      logs.push(routineLog(d, "r1", 0), routineLog(d, "r1", 1));
    }
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, routines: [r], routineLogs: logs });
    expect(result.has("routine-consistent")).toBe(true);
  });

  it("a day with only some steps done does not count, even across 7 days", () => {
    const r = routine("r1", ["Step A", "Step B"]);
    const logs: RoutineStepLog[] = [];
    for (let i = 1; i <= 7; i++) {
      const d = `2026-10-0${i}`;
      logs.push(routineLog(d, "r1", 0)); // only step 0, never step 1
    }
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, routines: [r], routineLogs: logs });
    expect(result.has("routine-consistent")).toBe(false);
  });

  it("routine-starter earns on a single done step, regardless of streak", () => {
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, routineLogsDone: 1 });
    expect(result.has("routine-starter")).toBe(true);
    expect(result.has("routine-consistent")).toBe(false);
  });
});

describe("computeEligibleBadgeKeys — medication streaks", () => {
  it("6 consecutive perfect days does not earn medication-consistent", () => {
    const m = medication("m1", "2026-09-25", 30);
    const logs = Array.from({ length: 6 }, (_, i) => medicationLog(`2026-10-0${i + 1}`, "m1"));
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, medications: [m], medicationLogs: logs });
    expect(result.has("medication-consistent")).toBe(false);
  });

  it("7 consecutive perfect days earns medication-consistent", () => {
    const m = medication("m1", "2026-09-25", 30);
    const logs = Array.from({ length: 7 }, (_, i) => medicationLog(`2026-10-0${i + 1}`, "m1"));
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, medications: [m], medicationLogs: logs });
    expect(result.has("medication-consistent")).toBe(true);
  });

  it("a day only counts if every medication active THAT DAY was taken, not just any medication ever", () => {
    // m2 only becomes active on 2026-10-05 — days before that shouldn't require it to be logged.
    const m1 = medication("m1", "2026-09-25", 30);
    const m2 = medication("m2", "2026-10-05", 30);
    const logs: MedicationLog[] = [];
    for (let i = 1; i <= 7; i++) {
      const d = `2026-10-0${i}`;
      logs.push(medicationLog(d, "m1"));
      if (i >= 5) logs.push(medicationLog(d, "m2"));
    }
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, medications: [m1, m2], medicationLogs: logs });
    expect(result.has("medication-consistent")).toBe(true);
  });

  it("missing a dose on a day that medication was active breaks the streak", () => {
    const m1 = medication("m1", "2026-09-25", 30);
    const m2 = medication("m2", "2026-10-05", 30);
    const logs: MedicationLog[] = [];
    for (let i = 1; i <= 7; i++) {
      const d = `2026-10-0${i}`;
      logs.push(medicationLog(d, "m1"));
      // m2 becomes active on day 5 but is never logged — those days should NOT count as perfect.
    }
    const result = computeEligibleBadgeKeys({ ...BASE_INPUTS, medications: [m1, m2], medicationLogs: logs });
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
