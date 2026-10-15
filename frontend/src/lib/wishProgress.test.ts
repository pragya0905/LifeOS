import { describe, expect, it } from "vitest";
import { nextWishIncrementPatch, wishIsIncrementable, wishRevertPatch } from "./wishProgress";
import type { Wish } from "../types";

function baseWish(overrides: Partial<Wish>): Wish {
  return {
    userId: "u1",
    wishId: "w1",
    title: "Save for Japan trip",
    type: "travel",
    progressMode: "quantity",
    status: "active",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("wishIsIncrementable", () => {
  it("is true for quantity, percentage, and milestone modes", () => {
    expect(wishIsIncrementable(baseWish({ progressMode: "quantity" }))).toBe(true);
    expect(wishIsIncrementable(baseWish({ progressMode: "percentage" }))).toBe(true);
    expect(wishIsIncrementable(baseWish({ progressMode: "milestone" }))).toBe(true);
  });

  it("is false for habit_linked and time_based modes", () => {
    expect(wishIsIncrementable(baseWish({ progressMode: "habit_linked" }))).toBe(false);
    expect(wishIsIncrementable(baseWish({ progressMode: "time_based" }))).toBe(false);
  });
});

describe("nextWishIncrementPatch", () => {
  it("bumps quantityCurrent by 1 from a defined or undefined base", () => {
    expect(nextWishIncrementPatch(baseWish({ progressMode: "quantity", quantityCurrent: 5 }))).toEqual({
      quantityCurrent: 6,
    });
    expect(nextWishIncrementPatch(baseWish({ progressMode: "quantity", quantityCurrent: undefined }))).toEqual({
      quantityCurrent: 1,
    });
  });

  it("bumps percentage by 10, clamped to 100", () => {
    expect(nextWishIncrementPatch(baseWish({ progressMode: "percentage", percentage: 50 }))).toEqual({
      percentage: 60,
    });
    expect(nextWishIncrementPatch(baseWish({ progressMode: "percentage", percentage: 95 }))).toEqual({
      percentage: 100,
    });
  });

  it("marks the first not-done milestone done, leaving the rest untouched", () => {
    const wish = baseWish({
      progressMode: "milestone",
      milestones: [
        { id: "m1", text: "Book flights", done: true },
        { id: "m2", text: "Book hotel", done: false },
        { id: "m3", text: "Pack", done: false },
      ],
    });
    expect(nextWishIncrementPatch(wish)).toEqual({
      milestones: [
        { id: "m1", text: "Book flights", done: true },
        { id: "m2", text: "Book hotel", done: true },
        { id: "m3", text: "Pack", done: false },
      ],
    });
  });

  it("returns null when every milestone is already done", () => {
    const wish = baseWish({
      progressMode: "milestone",
      milestones: [{ id: "m1", text: "Book flights", done: true }],
    });
    expect(nextWishIncrementPatch(wish)).toBeNull();
  });

  it("returns null for habit_linked and time_based modes", () => {
    expect(nextWishIncrementPatch(baseWish({ progressMode: "habit_linked" }))).toBeNull();
    expect(nextWishIncrementPatch(baseWish({ progressMode: "time_based" }))).toBeNull();
  });
});

describe("wishRevertPatch", () => {
  it("captures the wish's current progress fields for an undo", () => {
    const wish = baseWish({ quantityCurrent: 5, percentage: 50, milestones: [{ id: "m1", text: "x", done: true }] });
    expect(wishRevertPatch(wish)).toEqual({
      quantityCurrent: 5,
      percentage: 50,
      milestones: [{ id: "m1", text: "x", done: true }],
    });
  });
});
