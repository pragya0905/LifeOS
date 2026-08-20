import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../api/useApi";
import { todayLocal } from "../lib/date";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_BAR,
  EXPENSE_CATEGORY_EMOJI,
  EXPENSE_CATEGORY_LABEL,
  formatINR,
} from "../lib/expenseCategories";
import type { Budget, Expense, ExpenseCategory, UserProfile } from "../types";
import {
  badge,
  card,
  errorText,
  input,
  label,
  mutedText,
  page,
  pageTitle,
  primaryButton,
  secondaryButton,
  sectionLabel,
} from "../components/ui";

function currentMonth(): string {
  return todayLocal().slice(0, 7);
}

function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function lastDayOfMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, m, 0));
  return last.toISOString().slice(0, 10);
}

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(year, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function progressBarColor(fraction: number): string {
  if (fraction > 1) return "bg-alert";
  if (fraction >= 0.8) return "bg-amber";
  return "bg-bloom";
}

// Module-level (not nested in Budget) so React keeps element identity across re-renders,
// same reasoning as WishCard in Wishes.tsx and CycleGroup rendering in Cycle.tsx.
function CategoryBudgetCard({
  category,
  spent,
  budget,
  maxAllowed,
  onSave,
  onDelete,
}: {
  category: ExpenseCategory;
  spent: number;
  budget: Budget | undefined;
  // Highest value this category's budget can be set to without pushing the sum of all
  // category budgets past the overall monthly budget — null when no monthly budget is set,
  // meaning no cap applies.
  maxAllowed: number | null;
  onSave: (limit: number) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(budget?.monthlyLimit ?? ""));
  const [draftError, setDraftError] = useState<string | null>(null);

  if (!budget && !editing) {
    return (
      <div className={`flex items-center justify-between gap-3 ${card}`}>
        <span className="text-sm text-ink dark:text-paper">
          {EXPENSE_CATEGORY_EMOJI[category]} {EXPENSE_CATEGORY_LABEL[category]}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`${secondaryButton} px-2 py-1 text-xs`}
        >
          Set budget
        </button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className={card}>
        <p className="mb-2 text-sm font-medium text-ink dark:text-paper">
          {EXPENSE_CATEGORY_EMOJI[category]} {EXPENSE_CATEGORY_LABEL[category]}
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            placeholder="Monthly limit"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDraftError(null);
            }}
            className={`w-28 ${input}`}
          />
          <button
            type="button"
            onClick={() => {
              const n = Number(draft);
              if (!Number.isFinite(n) || n <= 0) {
                setDraftError("Enter a positive amount");
                return;
              }
              if (maxAllowed !== null && n > maxAllowed) {
                setDraftError(`Can't exceed ${formatINR(maxAllowed)} (remaining monthly budget)`);
                return;
              }
              onSave(n);
              setEditing(false);
            }}
            className={`${secondaryButton} px-2 py-1 text-xs`}
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDraftError(null);
            }}
            className={`${secondaryButton} px-2 py-1 text-xs`}
          >
            Cancel
          </button>
        </div>
        {draftError && <p className={`mt-1 ${errorText}`}>{draftError}</p>}
      </div>
    );
  }

  const limit = budget!.monthlyLimit;
  const fraction = spent / limit;
  const widthPct = Math.min(fraction, 1) * 100;
  const over = spent > limit;

  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink dark:text-paper">
          {EXPENSE_CATEGORY_EMOJI[category]} {EXPENSE_CATEGORY_LABEL[category]}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-bloom hover:underline">
            Edit
          </button>
          <button type="button" onClick={onDelete} className="text-xs text-alert hover:underline">
            Remove
          </button>
        </div>
      </div>
      <p className={`mt-1 text-xs ${mutedText}`}>
        {formatINR(spent)} of {formatINR(limit)}
      </p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stone dark:bg-stone-dark">
        <div className={`h-full ${progressBarColor(fraction)}`} style={{ width: `${widthPct}%` }} />
      </div>
      {over ? (
        <span className="mt-2 inline-block rounded-full bg-alert-soft px-2 py-0.5 text-xs font-medium text-alert dark:bg-alert-soft-dark dark:text-alert-light">
          Over by {formatINR(spent - limit)}
        </span>
      ) : (
        <span className={`mt-2 inline-block ${mutedText}`}>Remaining: {formatINR(limit - spent)}</span>
      )}
    </div>
  );
}

export default function BudgetPage() {
  const { request } = useApi();
  const [month, setMonth] = useState(currentMonth());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(todayLocal());
  const [category, setCategory] = useState<ExpenseCategory>("food");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingMonthlyBudget, setEditingMonthlyBudget] = useState(false);
  const [monthlyBudgetDraft, setMonthlyBudgetDraft] = useState("");
  const [monthlyBudgetError, setMonthlyBudgetError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const from = `${month}-01`;
        const to = lastDayOfMonth(month);
        const [expensesData, budgetsData, profileData] = await Promise.all([
          request<{ expenses: Expense[] }>(`/expenses?from=${from}&to=${to}`),
          request<{ budgets: Budget[] }>("/budgets"),
          request<UserProfile>("/profile"),
        ]);
        if (ignore) return;
        setExpenses(expensesData.expenses.slice().sort((a, b) => (a.date < b.date ? 1 : -1)));
        setBudgets(budgetsData.budgets);
        setProfile(profileData);
        setMonthlyBudgetDraft(profileData.monthlyBudget ? String(profileData.monthlyBudget) : "");
      } catch (err) {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Failed to load budget data");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    load();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function handleAddExpense(e: FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) {
      setError("Enter a non-negative amount");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const expense = await request<Expense>("/expenses", {
        method: "POST",
        body: JSON.stringify({ date, category, amount: amt, note: note.trim() || undefined }),
      });
      if (expense.date.slice(0, 7) === month) {
        setExpenses((prev) => [expense, ...prev].sort((a, b) => (a.date < b.date ? 1 : -1)));
      }
      setAmount("");
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save expense");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteExpense(expenseId: string) {
    setError(null);
    try {
      await request(`/expenses/${expenseId}`, { method: "DELETE" });
      setExpenses((prev) => prev.filter((e) => e.expenseId !== expenseId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete expense");
    }
  }

  async function handleSaveBudget(cat: ExpenseCategory, monthlyLimit: number) {
    setError(null);
    try {
      const budget = await request<Budget>(`/budgets/${cat}`, {
        method: "PUT",
        body: JSON.stringify({ monthlyLimit }),
      });
      setBudgets((prev) => [...prev.filter((b) => b.category !== cat), budget]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save budget");
    }
  }

  async function handleDeleteBudget(cat: ExpenseCategory) {
    setError(null);
    try {
      await request(`/budgets/${cat}`, { method: "DELETE" });
      setBudgets((prev) => prev.filter((b) => b.category !== cat));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove budget");
    }
  }

  async function handleSaveMonthlyBudget() {
    const n = Number(monthlyBudgetDraft);
    if (!Number.isFinite(n) || n <= 0) {
      setMonthlyBudgetError("Enter a positive amount");
      return;
    }
    setMonthlyBudgetError(null);
    setError(null);
    try {
      const updated = await request<UserProfile>("/profile", {
        method: "PATCH",
        body: JSON.stringify({ monthlyBudget: n }),
      });
      setProfile(updated);
      setEditingMonthlyBudget(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save monthly budget");
    }
  }

  const spentByCategory: Record<ExpenseCategory, number> = {
    food: 0, groceries: 0, transport: 0, shopping: 0, bills: 0, entertainment: 0, health: 0, rent: 0, other: 0,
  };
  for (const e of expenses) spentByCategory[e.category] += e.amount;

  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
  const sumOfCategoryBudgets = budgets.reduce((sum, b) => sum + b.monthlyLimit, 0);
  const monthlyBudget = profile?.monthlyBudget ?? null;
  const overallFraction = monthlyBudget ? totalSpent / monthlyBudget : 0;

  return (
    <div className={page}>
      <h1 className={pageTitle}>💰 Budget</h1>

      <div className={`mb-6 flex items-start justify-between gap-4 ${card}`}>
        <div>
          <span className={badge}>Private to you</span>
          <p className="mt-2 text-sm text-ink dark:text-paper">
            Log expenses by category and set a recurring monthly limit per category — set once,
            it applies every month going forward.
          </p>
        </div>
      </div>

      <div className={`mb-6 flex items-center justify-between gap-3 ${card}`}>
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} className={`${secondaryButton} px-3 py-1.5 text-sm`}>
          ← Prev
        </button>
        <span className="text-sm font-medium text-ink dark:text-paper">{monthLabel(month)}</span>
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          disabled={month >= currentMonth()}
          className={`${secondaryButton} px-3 py-1.5 text-sm`}
        >
          Next →
        </button>
      </div>

      <div className={`mb-6 ${card}`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className={sectionLabel}>This month</h2>
          {monthlyBudget !== null && !editingMonthlyBudget && (
            <button
              type="button"
              onClick={() => {
                setMonthlyBudgetDraft(String(monthlyBudget));
                setEditingMonthlyBudget(true);
              }}
              className="text-xs text-bloom hover:underline"
            >
              Edit
            </button>
          )}
        </div>

        {editingMonthlyBudget ? (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={1}
              placeholder="Monthly budget"
              value={monthlyBudgetDraft}
              onChange={(e) => {
                setMonthlyBudgetDraft(e.target.value);
                setMonthlyBudgetError(null);
              }}
              className={`w-32 ${input}`}
            />
            <button type="button" onClick={handleSaveMonthlyBudget} className={`${secondaryButton} px-2 py-1 text-xs`}>
              Save
            </button>
            {monthlyBudget !== null && (
              <button
                type="button"
                onClick={() => {
                  setEditingMonthlyBudget(false);
                  setMonthlyBudgetError(null);
                }}
                className={`${secondaryButton} px-2 py-1 text-xs`}
              >
                Cancel
              </button>
            )}
          </div>
        ) : monthlyBudget === null ? (
          <p className="mt-2 text-sm text-ink dark:text-paper">
            Total spent: <span className="font-medium">{formatINR(totalSpent)}</span>
            <br />
            <button
              type="button"
              onClick={() => setEditingMonthlyBudget(true)}
              className="mt-1 text-xs text-bloom hover:underline"
            >
              Set an overall monthly budget
            </button>
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink dark:text-paper">
              {formatINR(totalSpent)} of {formatINR(monthlyBudget)} budgeted
            </p>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-stone dark:bg-stone-dark">
              <div
                className={`h-full ${progressBarColor(overallFraction)}`}
                style={{ width: `${Math.min(overallFraction, 1) * 100}%` }}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className={mutedText}>Spent so far</p>
                <p className="mt-0.5 font-medium text-ink dark:text-paper">{formatINR(totalSpent)}</p>
              </div>
              <div>
                <p className={mutedText}>{monthlyBudget - totalSpent >= 0 ? "Left to spend" : "Over by"}</p>
                <p
                  className={`mt-0.5 font-medium ${
                    monthlyBudget - totalSpent >= 0 ? "text-ink dark:text-paper" : "text-alert"
                  }`}
                >
                  {formatINR(Math.abs(monthlyBudget - totalSpent))}
                </p>
              </div>
              <div>
                <p className={mutedText}>Assigned to categories</p>
                <p className="mt-0.5 font-medium text-ink dark:text-paper">{formatINR(sumOfCategoryBudgets)}</p>
              </div>
              <div>
                <p className={mutedText}>Left to categorize</p>
                <p className="mt-0.5 font-medium text-ink dark:text-paper">
                  {formatINR(Math.max(monthlyBudget - sumOfCategoryBudgets, 0))}
                </p>
              </div>
            </div>
          </>
        )}
        {monthlyBudgetError && <p className={`mt-1 ${errorText}`}>{monthlyBudgetError}</p>}
      </div>

      {expenses.length > 0 && (
        <div className={`mb-6 ${card}`}>
          <h2 className={`mb-3 ${sectionLabel}`}>Category breakdown</h2>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-stone dark:bg-stone-dark">
            {EXPENSE_CATEGORIES.filter((c) => spentByCategory[c] > 0).map((c) => (
              <div
                key={c}
                className={EXPENSE_CATEGORY_BAR[c]}
                style={{ width: `${(spentByCategory[c] / totalSpent) * 100}%` }}
                title={`${EXPENSE_CATEGORY_LABEL[c]}: ${formatINR(spentByCategory[c])}`}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {EXPENSE_CATEGORIES.filter((c) => spentByCategory[c] > 0).map((c) => (
              <span key={c} className={`flex items-center gap-1.5 text-xs ${mutedText}`}>
                <span className={`h-2 w-2 rounded-full ${EXPENSE_CATEGORY_BAR[c]}`} />
                {EXPENSE_CATEGORY_EMOJI[c]} {EXPENSE_CATEGORY_LABEL[c]} ({formatINR(spentByCategory[c])})
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mb-6">
        <h2 className={`mb-2 ${sectionLabel}`}>Category budgets</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {EXPENSE_CATEGORIES.map((c) => (
            <CategoryBudgetCard
              key={c}
              category={c}
              spent={spentByCategory[c]}
              budget={budgets.find((b) => b.category === c)}
              maxAllowed={
                monthlyBudget !== null
                  ? monthlyBudget - (sumOfCategoryBudgets - (budgets.find((b) => b.category === c)?.monthlyLimit ?? 0))
                  : null
              }
              onSave={(limit) => handleSaveBudget(c, limit)}
              onDelete={() => handleDeleteBudget(c)}
            />
          ))}
        </div>
      </div>

      <form onSubmit={handleAddExpense} className={`mb-8 flex flex-wrap items-end gap-3 ${card}`}>
        <div>
          <label className={label}>Date</label>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={input}
          />
        </div>
        <div>
          <label className={label}>Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            className={input}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_EMOJI[c]} {EXPENSE_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Amount (₹)</label>
          <input
            type="number"
            required
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`w-28 ${input}`}
          />
        </div>
        <div className="min-w-[160px] flex-1">
          <label className={label}>Note (optional)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. lunch with friends"
            className={`w-full ${input}`}
          />
        </div>
        <button type="submit" disabled={saving} className={primaryButton}>
          {saving ? "Saving..." : "Add expense"}
        </button>
      </form>

      {error && <p className={`mb-4 ${errorText}`}>{error}</p>}

      {loading ? (
        <p className={mutedText}>Loading expenses...</p>
      ) : expenses.length === 0 ? (
        <p className={mutedText}>No expenses logged for {monthLabel(month)}.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {expenses.map((expense) => (
            <li key={expense.expenseId} className={`flex flex-wrap items-center justify-between gap-3 ${card}`}>
              <div>
                <p className="text-xs font-medium text-ink-muted dark:text-mist-muted">{expense.date}</p>
                <span className="mt-1 inline-block rounded-full bg-stone px-2 py-0.5 text-xs font-medium text-ink-muted dark:bg-stone-dark dark:text-mist-muted">
                  {EXPENSE_CATEGORY_EMOJI[expense.category]} {EXPENSE_CATEGORY_LABEL[expense.category]}
                </span>
                <p className="mt-1 text-sm text-ink dark:text-paper">
                  {formatINR(expense.amount)}
                  {expense.note ? ` — ${expense.note}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDeleteExpense(expense.expenseId)}
                className={`${secondaryButton} px-2 py-1 text-xs`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
