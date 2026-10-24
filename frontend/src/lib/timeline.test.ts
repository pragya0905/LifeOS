import { describe, expect, it } from "vitest";
import type { LogEntry } from "../types";
import {
  assignLanes,
  bestFitGap,
  buildTimeline,
  cycleHintFor,
  findClashes,
  findFreeGaps,
  findOverlaps,
  formatDuration,
  parseHm,
  totalsByKind,
  viewportFor,
  weekDates,
  type TimelineBlock,
  type TimelineSource,
} from "./timeline";

// 2026-10-23 is a Friday (getDay() === 5).
const FRIDAY = new Date("2026-10-23T00:00:00");
const DATE = "2026-10-23";

function source(partial: Partial<TimelineSource> = {}): TimelineSource {
  return { routines: [], medications: [], tasks: [], sleep: [], meals: [], calls: [], ...partial };
}

function block(id: string, startMin: number, endMin: number): TimelineBlock {
  return { id, kind: "routine", title: id, startMin, endMin, lane: 0 };
}

describe("parseHm", () => {
  it("parses valid HH:MM", () => {
    expect(parseHm("06:30")).toBe(390);
    expect(parseHm("23:59")).toBe(1439);
  });

  it("rejects malformed or out-of-range values instead of guessing", () => {
    expect(parseHm(undefined)).toBeUndefined();
    expect(parseHm("")).toBeUndefined();
    expect(parseHm("6:30")).toBeUndefined();
    expect(parseHm("24:00")).toBeUndefined();
    expect(parseHm("12:60")).toBeUndefined();
  });
});

describe("buildTimeline", () => {
  it("places a routine with time and duration on the chart", () => {
    const { blocks, unscheduled } = buildTimeline(
      source({ routines: [{ routineId: "r1", name: "Morning routine", timeOfDay: "06:30", estimatedMinutes: 40 }] }),
      FRIDAY,
      DATE,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "routine", startMin: 390, endMin: 430 });
    expect(unscheduled).toEqual([]);
  });

  it("sends a routine with no time, or no duration, to Unscheduled with the reason", () => {
    const { blocks, unscheduled } = buildTimeline(
      source({
        routines: [
          { routineId: "a", name: "Stretch", estimatedMinutes: 10 },
          { routineId: "b", name: "Journal", timeOfDay: "21:00" },
        ],
      }),
      FRIDAY,
      DATE,
    );
    expect(blocks).toEqual([]);
    expect(unscheduled).toEqual([
      { id: "routine:a", kind: "routine", title: "Stretch", reason: "no time set" },
      { id: "routine:b", kind: "routine", title: "Journal", reason: "no duration set" },
    ]);
  });

  it("filters routines and medications by daysOfWeek (Friday is 5)", () => {
    const { blocks } = buildTimeline(
      source({
        routines: [
          { routineId: "weekend", name: "Brunch", timeOfDay: "10:00", estimatedMinutes: 30, daysOfWeek: [0, 6] },
          { routineId: "friday", name: "Gym", timeOfDay: "07:00", estimatedMinutes: 60, daysOfWeek: [5] },
        ],
        medications: [{ medicationId: "m1", name: "Vitamin D", timeOfDay: "08:00", estimatedMinutes: 5 }],
      }),
      FRIDAY,
      DATE,
    );
    expect(blocks.map((b) => b.id).sort()).toEqual(["med:m1", "routine:friday"]);
  });

  it("includes only open tasks due on the viewed date, using dueTime then scheduleTime", () => {
    const { blocks, unscheduled } = buildTimeline(
      source({
        tasks: [
          { taskId: "t1", title: "Report", dueDate: DATE, dueTime: "10:30", estimatedHours: 2, status: "todo" },
          { taskId: "t2", title: "Standup", dueDate: DATE, scheduleTime: "09:30", estimatedHours: 0.5, status: "in_progress" },
          { taskId: "t3", title: "Finished", dueDate: DATE, dueTime: "08:00", estimatedHours: 1, status: "done" },
          { taskId: "t4", title: "Other day", dueDate: "2026-10-24", dueTime: "08:00", estimatedHours: 1, status: "todo" },
          { taskId: "t5", title: "No time", dueDate: DATE, estimatedHours: 1, status: "todo" },
        ],
      }),
      FRIDAY,
      DATE,
    );
    expect(blocks.map((b) => b.id).sort()).toEqual(["task:t1", "task:t2"]);
    expect(blocks.find((b) => b.id === "task:t1")).toMatchObject({ startMin: 630, endMin: 750 });
    expect(unscheduled).toEqual([{ id: "task:t5", kind: "task", title: "No time", reason: "no time set" }]);
  });

  it("splits an overnight sleep block into the early-morning and bedtime segments", () => {
    const { blocks } = buildTimeline(source({ sleep: [{ logId: "s1", bedTime: "23:00", wakeTime: "06:30" }] }), FRIDAY, DATE);
    const sleep = blocks.filter((b) => b.kind === "sleep").sort((a, b) => a.startMin - b.startMin);
    expect(sleep).toHaveLength(2);
    expect(sleep[0]).toMatchObject({ startMin: 0, endMin: 390, continuesFromPrevious: true });
    expect(sleep[1]).toMatchObject({ startMin: 1380, endMin: 1440 });
  });

  it("draws a same-day sleep block (a nap) as a single segment", () => {
    const { blocks } = buildTimeline(source({ sleep: [{ logId: "n1", bedTime: "13:00", wakeTime: "14:30" }] }), FRIDAY, DATE);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ startMin: 780, endMin: 870 });
  });

  it("puts sleep with only one time into Unscheduled rather than drawing a guess", () => {
    const { blocks, unscheduled } = buildTimeline(source({ sleep: [{ logId: "s2", bedTime: "23:00" }] }), FRIDAY, DATE);
    expect(blocks).toEqual([]);
    expect(unscheduled).toEqual([{ id: "sleep:s2", kind: "sleep", title: "Sleep", reason: "no time set" }]);
  });

  it("clips a block that runs past midnight to the end of the day", () => {
    const { blocks } = buildTimeline(
      source({ routines: [{ routineId: "late", name: "Late", timeOfDay: "23:30", estimatedMinutes: 60 }] }),
      FRIDAY,
      DATE,
    );
    expect(blocks[0]).toMatchObject({ startMin: 1410, endMin: 1440 });
  });
});

describe("assignLanes", () => {
  it("puts overlapping blocks in different lanes and reuses lane 0 when free", () => {
    const laned = assignLanes([block("a", 0, 60), block("b", 30, 90), block("c", 60, 120)]);
    const lanes = Object.fromEntries(laned.map((b) => [b.id, b.lane]));
    expect(lanes.a).toBe(0);
    expect(lanes.b).toBe(1);
    expect(lanes.c).toBe(0);
  });

  it("does not treat blocks that merely touch as overlapping", () => {
    const laned = assignLanes([block("a", 0, 60), block("b", 60, 120)]);
    expect(laned.every((b) => b.lane === 0)).toBe(true);
  });

  it("with no minVisualGapMin, two short blocks 30 minutes apart share a lane (today's default)", () => {
    const laned = assignLanes([block("a", 360, 362), block("b", 390, 392)]);
    expect(laned.every((b) => b.lane === 0)).toBe(true);
  });

  it("minVisualGapMin pushes two short blocks that don't overlap in time, but would overlap visually, onto separate lanes", () => {
    // 06:00-06:02 and 06:30-06:32, 30 real minutes apart — too close for a 150px-min block at
    // 96px/hour (≈94 real minutes' worth of width) not to visually collide.
    const laned = assignLanes([block("a", 360, 362), block("b", 390, 392)], 94);
    const lanes = Object.fromEntries(laned.map((b) => [b.id, b.lane]));
    expect(lanes.a).toBe(0);
    expect(lanes.b).toBe(1);
  });

  it("minVisualGapMin never shrinks a block that's already wide enough on its own", () => {
    const laned = assignLanes([block("a", 0, 120), block("b", 120, 240)], 30);
    expect(laned.every((b) => b.lane === 0)).toBe(true);
  });
});

describe("findOverlaps", () => {
  it("flags every pair that shares time", () => {
    const pairs = findOverlaps([block("a", 0, 60), block("b", 30, 90), block("c", 100, 110)]);
    expect(pairs.map(([x, y]) => `${x.id}-${y.id}`)).toEqual(["a-b"]);
  });

  it("does not flag touching blocks", () => {
    expect(findOverlaps([block("a", 0, 60), block("b", 60, 120)])).toEqual([]);
  });
});

describe("findFreeGaps", () => {
  it("finds gaps of at least the minimum length, including the start and end of the day", () => {
    const gaps = findFreeGaps([block("a", 120, 180), block("b", 600, 660)]);
    expect(gaps).toEqual([
      { startMin: 0, endMin: 120 },
      { startMin: 180, endMin: 600 },
      { startMin: 660, endMin: 1440 },
    ]);
  });

  it("ignores gaps shorter than the minimum", () => {
    expect(findFreeGaps([block("a", 0, 1400)], 60)).toEqual([]);
  });

  it("treats an empty day as one full-day gap", () => {
    expect(findFreeGaps([])).toEqual([{ startMin: 0, endMin: 1440 }]);
  });
});

describe("totalsByKind and formatDuration", () => {
  it("sums minutes per kind", () => {
    const totals = totalsByKind([
      { ...block("s", 0, 390), kind: "sleep" },
      { ...block("r", 390, 430), kind: "routine" },
      { ...block("t", 600, 720), kind: "task" },
    ]);
    expect(totals).toEqual({ sleep: 390, routine: 40, med: 0, meal: 0, task: 120, workout: 0, call: 0 });
  });

  it("formats minutes into compact hour and minute text", () => {
    expect(formatDuration(450)).toBe("7h 30m");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(45)).toBe("45m");
  });
});

describe("viewportFor", () => {
  it("shows the whole day at 24h", () => {
    expect(viewportFor(24, 720)).toEqual({ startMin: 0, endMin: 1440 });
  });

  it("centres a 2h zoom on the requested time", () => {
    expect(viewportFor(2, 600)).toEqual({ startMin: 540, endMin: 660 });
  });

  it("clamps a zoomed window to the start and end of the day", () => {
    expect(viewportFor(2, 10)).toEqual({ startMin: 0, endMin: 120 });
    expect(viewportFor(2, 1430)).toEqual({ startMin: 1320, endMin: 1440 });
  });
});

describe("meals", () => {
  it("places each meal at its nominal time, skipping empty slots", () => {
    const { blocks } = buildTimeline(
      source({
        meals: [
          { mealType: "breakfast", text: "Oats" },
          { mealType: "lunch", text: "   " },
          { mealType: "dinner", text: "Dal and rice" },
        ],
      }),
      FRIDAY,
      DATE,
    );
    expect(blocks.map((b) => [b.kind, b.title, b.startMin, b.endMin])).toEqual([
      ["meal", "Oats", 480, 510],
      ["meal", "Dal and rice", 1140, 1170],
    ]);
  });

  it("uses a caller-supplied nominal time over the default", () => {
    const { blocks } = buildTimeline(
      source({ meals: [{ mealType: "breakfast", text: "Oats" }] }),
      FRIDAY,
      DATE,
      { breakfast: 7 * 60 },
    );
    expect(blocks[0]).toMatchObject({ startMin: 420, endMin: 450 });
  });

  it("drops a meal type the override has no entry for, same as today's missing-slot behavior", () => {
    const { blocks, unscheduled } = buildTimeline(
      source({ meals: [{ mealType: "snack", text: "Nuts" }] }),
      FRIDAY,
      DATE,
      { breakfast: 7 * 60 },
    );
    expect(blocks).toEqual([]);
    expect(unscheduled).toEqual([]);
  });
});

describe("bestFitGap", () => {
  it("picks the tightest gap that still fits", () => {
    const gaps = [
      { startMin: 0, endMin: 300 },
      { startMin: 400, endMin: 480 },
      { startMin: 600, endMin: 1440 },
    ];
    expect(bestFitGap(gaps, 60)).toEqual({ startMin: 400, endMin: 480 });
  });

  it("returns undefined when nothing fits", () => {
    expect(bestFitGap([{ startMin: 0, endMin: 30 }], 45)).toBeUndefined();
  });
});

describe("weekDates", () => {
  it("returns Monday to Sunday for a Friday", () => {
    expect(weekDates("2026-10-23")).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
  });

  it("starts on the same Monday when the date is a Sunday", () => {
    expect(weekDates("2026-10-25")[0]).toBe("2026-10-19");
  });
});

describe("cycleHintFor", () => {
  const cycleEntry = (date: string, event: string) => ({ date, data: { event }, logId: date, logType: "cycle", userId: "u", source: "manual", createdAt: "", updatedAt: "" }) as unknown as LogEntry;

  it("returns null without enough logged history to estimate", () => {
    expect(cycleHintFor([cycleEntry("2026-09-01", "period_start")], DATE)).toBeNull();
  });

  it("returns a hint once two cycles are logged", () => {
    const entries = [cycleEntry("2026-08-01", "period_start"), cycleEntry("2026-08-05", "period_end"), cycleEntry("2026-09-01", "period_start"), cycleEntry("2026-09-05", "period_end")];
    expect(cycleHintFor(entries, DATE)).toEqual(expect.any(String));
  });
});

describe("findClashes", () => {
  const med = { id: "med:1", name: "Glutone", timeOfDay: "06:00", estimatedMinutes: 10 };

  it("flags an overlapping item on a shared day", () => {
    const candidate = { id: "routine:new", name: "Morning", timeOfDay: "06:05", estimatedMinutes: 20 };
    expect(findClashes(candidate, [med])).toEqual([med]);
  });

  it("ignores items whose windows only touch", () => {
    const candidate = { id: "routine:new", name: "Morning", timeOfDay: "06:10", estimatedMinutes: 20 };
    expect(findClashes(candidate, [med])).toEqual([]);
  });

  it("ignores overlaps on days the other item does not run", () => {
    const weekendOnly = { ...med, daysOfWeek: [0, 6] };
    const candidate = { id: "routine:new", name: "Morning", timeOfDay: "06:05", estimatedMinutes: 20, daysOfWeek: [1, 2, 3] };
    expect(findClashes(candidate, [weekendOnly])).toEqual([]);
  });

  it("does nothing without both a time and a duration", () => {
    expect(findClashes({ id: "x", name: "No time", estimatedMinutes: 20 }, [med])).toEqual([]);
    expect(findClashes({ id: "x", name: "No length", timeOfDay: "06:05" }, [med])).toEqual([]);
  });
});

describe("workouts, calls, and protected tasks", () => {
  it("places a workout with a start time and minutes", () => {
    const { blocks } = buildTimeline(source({ workout: { startTime: "07:00", minutes: 45 } }), FRIDAY, DATE);
    expect(blocks).toEqual([{ id: "workout", kind: "workout", title: "Workout", startMin: 420, endMin: 465, lane: 0 }]);
  });

  it("sends a workout with no start time to Unscheduled", () => {
    const { unscheduled } = buildTimeline(source({ workout: { minutes: 45 } }), FRIDAY, DATE);
    expect(unscheduled).toEqual([{ id: "workout", kind: "workout", title: "Workout", reason: "no time set" }]);
  });

  it("places a call with a start time and duration", () => {
    const { blocks } = buildTimeline(source({ calls: [{ logId: "c1", personName: "Mom", startTime: "18:00", durationMinutes: 20 }] }), FRIDAY, DATE);
    expect(blocks[0]).toMatchObject({ id: "call:c1", kind: "call", title: "Call with Mom", startMin: 1080, endMin: 1100 });
  });

  it("marks a task with blockType protected on its block", () => {
    const { blocks } = buildTimeline(
      source({ tasks: [{ taskId: "p1", title: "Deep work", dueDate: DATE, dueTime: "10:00", estimatedHours: 2, status: "todo", blockType: "protected" }] }),
      FRIDAY,
      DATE,
    );
    expect(blocks[0]).toMatchObject({ id: "task:p1", protected: true });
  });

  it("leaves a normal task's protected flag unset", () => {
    const { blocks } = buildTimeline(
      source({ tasks: [{ taskId: "t1", title: "Normal", dueDate: DATE, dueTime: "10:00", estimatedHours: 1, status: "todo" }] }),
      FRIDAY,
      DATE,
    );
    expect(blocks[0].protected).toBeUndefined();
  });
});
