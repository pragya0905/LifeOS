import { describe, expect, it } from "vitest";
import type { Wish } from "../types";
import { canRestoreWish, wishDefinition } from "./wishRestore";

const base: Wish = {
  userId: "u",
  wishId: "w1",
  title: "Read 12 books",
  type: "learning",
  progressMode: "quantity",
  status: "active",
  quantityTarget: 12,
  quantityUnit: "books",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};

describe("canRestoreWish", () => {
  it("allows Undo for a wish with nothing to lose", () => {
    expect(canRestoreWish(base)).toBe(true);
  });

  it("refuses Undo when photos would be lost", () => {
    expect(canRestoreWish({ ...base, imageKeys: ["a.jpg"] })).toBe(false);
  });

  it("refuses Undo when progress would be lost", () => {
    expect(canRestoreWish({ ...base, quantityCurrent: 3 })).toBe(false);
    expect(canRestoreWish({ ...base, percentage: 40 })).toBe(false);
    expect(canRestoreWish({ ...base, milestones: [{ id: "m1", text: "Chapter 1", done: true }] })).toBe(false);
  });

  it("refuses Undo for a wish that isn't active", () => {
    expect(canRestoreWish({ ...base, status: "completed" as never })).toBe(false);
  });
});

describe("wishDefinition", () => {
  it("keeps only the fields the create endpoint takes", () => {
    const def = wishDefinition({ ...base, imageKeys: ["a.jpg"], percentage: 10 });
    expect(def).toEqual({
      title: "Read 12 books",
      type: "learning",
      progressMode: "quantity",
      targetDate: undefined,
      quantityTarget: 12,
      quantityUnit: "books",
      linkedHabitType: undefined,
      habitLinkTargetValue: undefined,
    });
    expect(def).not.toHaveProperty("imageKeys");
    expect(def).not.toHaveProperty("percentage");
  });
});
