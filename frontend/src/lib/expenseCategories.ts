import type { ExpenseCategory } from "../types";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "food",
  "groceries",
  "transport",
  "shopping",
  "bills",
  "entertainment",
  "health",
  "rent",
  "other",
];

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  food: "Food",
  groceries: "Groceries",
  transport: "Transport",
  shopping: "Shopping",
  bills: "Bills",
  entertainment: "Entertainment",
  health: "Health",
  rent: "Rent",
  other: "Other",
};

export const EXPENSE_CATEGORY_EMOJI: Record<ExpenseCategory, string> = {
  food: "🍔",
  groceries: "🛒",
  transport: "🚗",
  shopping: "🛍️",
  bills: "🧾",
  entertainment: "🎬",
  health: "🏥",
  rent: "🏠",
  other: "📦",
};

// One distinct Tailwind background per category, used consistently for both the
// category-breakdown bar and any per-category badges so the same category always
// reads as the same color throughout the page.
export const EXPENSE_CATEGORY_BAR: Record<ExpenseCategory, string> = {
  food: "bg-alert",
  groceries: "bg-amber",
  transport: "bg-bloom",
  shopping: "bg-bloom-light",
  bills: "bg-stone-dark dark:bg-mist-muted",
  entertainment: "bg-amber-ink dark:bg-amber-ink-dark",
  health: "bg-alert-light",
  rent: "bg-ink-muted dark:bg-mist-muted",
  other: "bg-mist-muted",
};

export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}
