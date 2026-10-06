import { describe, expect, it } from "vitest";
import { progressFractionForWish, summarizeBudgets, summarizeHabits, summarizeWishes, type WishWithProgress } from "./progressSummary";
import type { Budget, Expense, HabitLog } from "./types";

function baseWish(overrides: Partial<WishWithProgress> = {}): WishWithProgress {
  return {
    userId: "u1",
    wishId: "w1",
    title: "Test",
    type: "personal_growth",
    progressMode: "percentage",
    status: "active",
    habitLinkedProgress: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("progressFractionForWish", () => {
  it("percentage mode reads the stored percentage", () => {
    expect(progressFractionForWish(baseWish({ progressMode: "percentage", percentage: 40 }))).toBe(0.4);
  });

  it("milestone mode is the fraction of milestones done", () => {
    const wish = baseWish({
      progressMode: "milestone",
      milestones: [
        { id: "1", text: "a", done: true },
        { id: "2", text: "b", done: true },
        { id: "3", text: "c", done: false },
        { id: "4", text: "d", done: false },
      ],
    });
    expect(progressFractionForWish(wish)).toBe(0.5);
  });

  it("milestone mode with no milestones returns null, not NaN or a crash", () => {
    expect(progressFractionForWish(baseWish({ progressMode: "milestone", milestones: [] }))).toBeNull();
  });

  it("quantity mode caps at 1 even if current exceeds target", () => {
    const wish = baseWish({ progressMode: "quantity", quantityTarget: 10, quantityCurrent: 15 });
    expect(progressFractionForWish(wish)).toBe(1);
  });

  it("quantity mode with no target returns null", () => {
    expect(progressFractionForWish(baseWish({ progressMode: "quantity" }))).toBeNull();
  });

  it("habit_linked mode reads the precomputed live progress, not a stored field", () => {
    const wish = baseWish({ progressMode: "habit_linked", habitLinkedProgress: 75 });
    expect(progressFractionForWish(wish)).toBe(0.75);
  });
});

describe("summarizeWishes", () => {
  const now = new Date("2026-06-01T00:00:00.000Z");

  it("flags a wish as falling behind when elapsed time far outpaces progress", () => {
    const wish = baseWish({
      createdAt: "2026-01-01T00:00:00.000Z", // 5 months elapsed of a 6-month wish = ~83% elapsed
      targetDate: "2026-07-01",
      progressMode: "percentage",
      percentage: 10, // only 10% done
    });
    const [summary] = summarizeWishes([wish], now);
    expect(summary.fallingBehind).toBe(true);
  });

  it("does not flag a wish on pace", () => {
    const wish = baseWish({
      createdAt: "2026-01-01T00:00:00.000Z",
      targetDate: "2026-07-01",
      progressMode: "percentage",
      percentage: 90,
    });
    const [summary] = summarizeWishes([wish], now);
    expect(summary.fallingBehind).toBe(false);
  });

  it("excludes wishes with no target date or non-active status", () => {
    const noTarget = baseWish({ targetDate: undefined });
    const completed = baseWish({ targetDate: "2026-07-01", status: "completed" });
    expect(summarizeWishes([noTarget, completed], now)).toHaveLength(0);
  });
});

describe("summarizeHabits", () => {
  function log(date: string, status: "done" | "missed" = "done"): HabitLog {
    return {
      userId: "u1",
      dateHabitType: `${date}#water`,
      date,
      habitType: "water",
      status,
      value: 1000,
      source: "manual",
      createdAt: date,
      updatedAt: date,
    };
  }

  it("computes a current streak ending today, stopping at the first gap", () => {
    const now = new Date("2026-10-06T12:00:00.000Z");
    const logs = [log("2026-10-06"), log("2026-10-05"), log("2026-10-04"), log("2026-10-02")]; // gap on 10-03
    const summaries = summarizeHabits(logs, now);
    const water = summaries.find((s) => s.habitType === "water")!;
    expect(water.currentStreakDays).toBe(3);
  });

  it("a missed-status log does not count toward the streak", () => {
    const now = new Date("2026-10-06T12:00:00.000Z");
    const logs = [log("2026-10-06", "missed")];
    const summaries = summarizeHabits(logs, now);
    expect(summaries.find((s) => s.habitType === "water")!.currentStreakDays).toBe(0);
  });
});

describe("summarizeBudgets", () => {
  function expense(category: Expense["category"], amount: number): Expense {
    return { userId: "u1", expenseId: "e1", category, amount, date: "2026-10-05", source: "manual", createdAt: "x", updatedAt: "x" };
  }
  function budget(category: Budget["category"], monthlyLimit: number): Budget {
    return { userId: "u1", category, monthlyLimit, createdAt: "x", updatedAt: "x" };
  }

  it("computes remainingThisMonth as a real subtraction, not left to a model to guess", () => {
    const now = new Date("2026-10-06T00:00:00.000Z"); // day 6 of October (31 days)
    const [summary] = summarizeBudgets([budget("food", 5000)], [expense("food", 1200)], now);
    expect(summary.spentSoFar).toBe(1200);
    expect(summary.remainingThisMonth).toBe(3800);
  });

  it("projects month-end total from the daily pace so far", () => {
    const now = new Date("2026-10-10T00:00:00.000Z"); // day 10 of a 31-day month
    const [summary] = summarizeBudgets([budget("food", 3000)], [expense("food", 1000)], now);
    // 1000 / 10 days * 31 days = 3100
    expect(summary.projectedMonthEndTotal).toBe(3100);
    expect(summary.projectedOverBy).toBe(100);
  });

  it("only sums expenses matching the budget's own category", () => {
    const now = new Date("2026-10-06T00:00:00.000Z");
    const [summary] = summarizeBudgets(
      [budget("food", 5000)],
      [expense("food", 500), expense("transport", 2000)],
      now,
    );
    expect(summary.spentSoFar).toBe(500);
  });
});
