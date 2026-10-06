import { describe, expect, it } from "vitest";
import {
  daysBetween,
  predictNextCycle,
  computeAvgPeriodDays,
  phaseBoundaries,
  phaseForCycleDay,
  estimatePhase,
} from "./cyclePhase";
import type { LogEntry } from "../types";

function periodEvent(date: string, event: "period_start" | "period_end"): LogEntry {
  return {
    userId: "u1",
    logId: `${date}-${event}`,
    logType: "cycle",
    date,
    data: { event },
    source: "manual",
    createdAt: date,
    updatedAt: date,
  } as unknown as LogEntry;
}

describe("daysBetween", () => {
  it("computes whole-day differences", () => {
    expect(daysBetween("2026-10-01", "2026-10-06")).toBe(5);
  });
});

describe("predictNextCycle", () => {
  it("returns null when fewer than 2 period starts are logged", () => {
    expect(predictNextCycle([periodEvent("2026-09-01", "period_start")])).toEqual({
      avgCycleDays: null,
      nextPredicted: null,
    });
  });

  it("averages the gaps between starts and projects forward from the last one", () => {
    const entries = [
      periodEvent("2026-08-01", "period_start"),
      periodEvent("2026-08-29", "period_start"), // 28 days later
      periodEvent("2026-09-26", "period_start"), // 28 days later
    ];
    const { avgCycleDays, nextPredicted } = predictNextCycle(entries);
    expect(avgCycleDays).toBe(28);
    expect(nextPredicted).toBe("2026-10-24");
  });
});

describe("computeAvgPeriodDays", () => {
  it("returns null when there are no periods logged", () => {
    expect(computeAvgPeriodDays([])).toBeNull();
  });

  it("pairs each start with the next end on or after it (inclusive day count)", () => {
    const entries = [
      periodEvent("2026-09-01", "period_start"),
      periodEvent("2026-09-05", "period_end"), // 5 days inclusive
    ];
    expect(computeAvgPeriodDays(entries)).toBe(5);
  });

  it("skips a start with no matching end rather than throwing", () => {
    const entries = [periodEvent("2026-09-01", "period_start")];
    expect(computeAvgPeriodDays(entries)).toBeNull();
  });
});

describe("phaseBoundaries / phaseForCycleDay", () => {
  it("a 28-day cycle with a 5-day period puts ovulation around day 14", () => {
    const { periodEnd, fertileStart, fertileEnd } = phaseBoundaries(28, 5);
    expect(periodEnd).toBe(5);
    expect(fertileEnd).toBe(15); // ovulationDay(14) + 1
    expect(fertileStart).toBe(9); // ovulationDay(14) - 5
  });

  it("classifies each cycle day into the correct phase", () => {
    expect(phaseForCycleDay(3, 28, 5)).toBe("Menstrual");
    expect(phaseForCycleDay(7, 28, 5)).toBe("Follicular");
    expect(phaseForCycleDay(14, 28, 5)).toBe("Ovulation");
    expect(phaseForCycleDay(20, 28, 5)).toBe("Luteal");
  });
});

describe("estimatePhase", () => {
  it("wraps the cycle day correctly across multiple cycle lengths", () => {
    // 28-day cycle starting 2026-09-01; 2026-10-01 is 30 days later -> cycle day 3 of the next cycle
    const { cycleDay, phase } = estimatePhase("2026-10-01", "2026-09-01", 28, 5);
    expect(cycleDay).toBe(3);
    expect(phase).toBe("Menstrual");
  });

  it("flags the fertile window as fertile", () => {
    const { isFertile } = estimatePhase("2026-09-14", "2026-09-01", 28, 5);
    expect(isFertile).toBe(true);
  });
});
