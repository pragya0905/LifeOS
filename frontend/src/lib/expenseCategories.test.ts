import { describe, expect, it } from "vitest";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL, EXPENSE_CATEGORY_EMOJI, EXPENSE_CATEGORY_BAR, formatINR } from "./expenseCategories";

describe("EXPENSE_CATEGORIES lookups", () => {
  it("every category has a label, emoji, and bar color — no gaps", () => {
    for (const category of EXPENSE_CATEGORIES) {
      expect(EXPENSE_CATEGORY_LABEL[category]).toBeTruthy();
      expect(EXPENSE_CATEGORY_EMOJI[category]).toBeTruthy();
      expect(EXPENSE_CATEGORY_BAR[category]).toBeTruthy();
    }
  });
});

describe("formatINR", () => {
  it("formats as a rupee amount with no decimal places", () => {
    expect(formatINR(1200)).toBe("₹1,200");
  });

  it("uses Indian digit grouping for large amounts", () => {
    expect(formatINR(1234567)).toBe("₹12,34,567");
  });

  it("rounds off fractional paise rather than showing them", () => {
    expect(formatINR(99.6)).toBe("₹100");
  });
});
