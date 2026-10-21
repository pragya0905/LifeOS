import { describe, expect, it } from "vitest";
import { MAX_CONSECUTIVE_PAUSE_DAYS, applyPauseCap, classifyDay, streakFromOutcomes, type DayOutcome } from "./streaks";

describe("classifyDay", () => {
  it("all skipped (or all N/A) pauses", () => {
    expect(classifyDay(["skipped", "skipped"], false)).toBe("pause");
    expect(classifyDay(["not_applicable", "not_applicable"], false)).toBe("pause");
    expect(classifyDay(["skipped", "not_applicable"], false)).toBe("pause");
  });

  it("an explicit missed item breaks the day, even today", () => {
    expect(classifyDay(["missed"], false)).toBe("break");
    expect(classifyDay(["missed"], true)).toBe("break");
    expect(classifyDay(["done", "missed"], false)).toBe("break");
  });

  it("an unresolved item breaks a past day", () => {
    expect(classifyDay(["unresolved"], false)).toBe("break");
    expect(classifyDay(["done", "unresolved"], false)).toBe("break");
  });

  it("an unresolved item on today pauses instead of breaking", () => {
    expect(classifyDay(["unresolved"], true)).toBe("pause");
    expect(classifyDay(["done", "unresolved"], true)).toBe("pause");
  });

  it("today already fully resolved with a done item advances like any other day", () => {
    expect(classifyDay(["done", "skipped"], true)).toBe("advance");
  });

  it("today fully resolved with everything skipped pauses like any other day (not forced)", () => {
    expect(classifyDay(["skipped", "not_applicable"], true)).toBe("pause");
  });

  it("multi-item mixed Done+Skipped+N-A with nothing missing advances", () => {
    expect(classifyDay(["done", "skipped", "not_applicable"], false)).toBe("advance");
  });

  it("multi-item mixed Done+Skipped with one item never logged breaks (unresolved beats done)", () => {
    expect(classifyDay(["done", "skipped", "unresolved"], false)).toBe("break");
  });

  it("a single Taken item advances (medication's one-item-per-day case)", () => {
    expect(classifyDay(["done"], false)).toBe("advance");
  });
});

describe("applyPauseCap", () => {
  function pauses(n: number): DayOutcome[] {
    return Array.from({ length: n }, () => "pause" as const);
  }

  it("up to the cap, pauses stay pauses", () => {
    const result = applyPauseCap(pauses(MAX_CONSECUTIVE_PAUSE_DAYS));
    expect(result).toEqual(pauses(MAX_CONSECUTIVE_PAUSE_DAYS));
  });

  it("the (cap + 1)th consecutive pause breaks instead", () => {
    const result = applyPauseCap(pauses(MAX_CONSECUTIVE_PAUSE_DAYS + 1));
    expect(result).toEqual([...pauses(MAX_CONSECUTIVE_PAUSE_DAYS), "break"]);
  });

  it("an advance in the middle resets the consecutive-pause count", () => {
    const outcomes: DayOutcome[] = [...pauses(MAX_CONSECUTIVE_PAUSE_DAYS), "advance", ...pauses(MAX_CONSECUTIVE_PAUSE_DAYS)];
    const result = applyPauseCap(outcomes);
    // Neither pause run exceeds the cap on its own, so nothing converts to break.
    expect(result.filter((o) => o === "break")).toHaveLength(0);
  });

  it("after a cap-triggered break, a fresh pause run starts counting from zero (days 9/10 don't also break)", () => {
    // 8 consecutive pauses: day 8 breaks. Days 9 and 10 are then pauses 1 and 2 of a new run.
    const result = applyPauseCap(pauses(10));
    expect(result).toEqual([...pauses(MAX_CONSECUTIVE_PAUSE_DAYS), "break", "pause", "pause"]);
  });

  it("a break in the middle also resets the consecutive-pause count", () => {
    const outcomes: DayOutcome[] = [...pauses(5), "break", ...pauses(5)];
    const result = applyPauseCap(outcomes);
    expect(result.filter((o) => o === "break")).toHaveLength(1);
  });
});

describe("streakFromOutcomes", () => {
  it("empty sequence is zero/zero", () => {
    expect(streakFromOutcomes([])).toEqual({ current: 0, best: 0 });
  });

  it("all advances: current and best both equal the run length", () => {
    const outcomes: DayOutcome[] = Array.from({ length: 5 }, () => "advance");
    expect(streakFromOutcomes(outcomes)).toEqual({ current: 5, best: 5 });
  });

  it("a pause in the middle bridges the streak without severing it, but doesn't add to the count itself", () => {
    const outcomes: DayOutcome[] = ["advance", "advance", "pause", "advance", "advance"];
    // 4 advance days contribute to the count; the pause day neither adds nor breaks.
    expect(streakFromOutcomes(outcomes)).toEqual({ current: 4, best: 4 });
  });

  it("a skipped day immediately followed by a missed/unresolved day: pause then break", () => {
    const outcomes: DayOutcome[] = ["advance", "advance", "pause", "break"];
    // current: walk back from the end — break stops it immediately.
    expect(streakFromOutcomes(outcomes).current).toBe(0);
    // best: the 2-day advance run before the pause/break is the longest ever achieved.
    expect(streakFromOutcomes(outcomes).best).toBe(2);
  });

  it("a missed/unresolved day immediately followed by a skipped day: break resets first, the pause after doesn't start counting from it", () => {
    const outcomes: DayOutcome[] = ["advance", "advance", "break", "pause"];
    expect(streakFromOutcomes(outcomes)).toEqual({ current: 0, best: 2 });
  });

  it("best is the historical maximum even if a later, shorter run is still current", () => {
    const outcomes: DayOutcome[] = [
      "advance", "advance", "advance", "advance", "advance",
      "advance", "advance", "advance", "advance", "advance", // 10-day run
      "break",
      "advance", "advance", "advance", // 3-day run, still ongoing
    ];
    expect(streakFromOutcomes(outcomes)).toEqual({ current: 3, best: 10 });
  });

  it("a break at the very end makes current 0 regardless of best", () => {
    const outcomes: DayOutcome[] = ["advance", "advance", "advance", "advance", "advance", "advance", "advance", "break"];
    expect(streakFromOutcomes(outcomes)).toEqual({ current: 0, best: 7 });
  });

  it("the pause cap is applied before computing current/best — an 8th consecutive pause breaks an otherwise-alive streak", () => {
    const outcomes: DayOutcome[] = ["advance", "advance", "advance", ...Array.from({ length: MAX_CONSECUTIVE_PAUSE_DAYS + 1 }, () => "pause" as const)];
    const result = streakFromOutcomes(outcomes);
    expect(result.current).toBe(0); // the 8th pause converted to break, which is the last element
    expect(result.best).toBe(3);
  });

  it("exactly MAX_CONSECUTIVE_PAUSE_DAYS pauses, then a done day, still advances (cap only fires on exceeding it)", () => {
    const outcomes: DayOutcome[] = ["advance", "advance", ...Array.from({ length: MAX_CONSECUTIVE_PAUSE_DAYS }, () => "pause" as const), "advance"];
    expect(streakFromOutcomes(outcomes)).toEqual({ current: 3, best: 3 });
  });
});
