import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../api/useApi";
import { todayLocal } from "../lib/date";
import { formatINR } from "../lib/expenseCategories";
import type { Expense, UserProfile } from "../types";
import { Skeleton } from "./Skeleton";
import { card, sectionLabel } from "./ui";

function currentMonthRange(): { from: string; to: string } {
  const month = todayLocal().slice(0, 7);
  const [year, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
  return { from: `${month}-01`, to: lastDay };
}

function progressBarColor(fraction: number): string {
  if (fraction > 1) return "bg-alert";
  if (fraction >= 0.8) return "bg-amber";
  return "bg-bloom";
}

export default function BudgetPreview() {
  const { request } = useApi();
  const [totalSpent, setTotalSpent] = useState<number | null>(null);
  const [monthlyBudget, setMonthlyBudget] = useState<number | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const { from, to } = currentMonthRange();
        const [expensesData, profileData] = await Promise.all([
          request<{ expenses: Expense[] }>(`/expenses?from=${from}&to=${to}`),
          request<UserProfile>("/profile"),
        ]);
        if (ignore) return;
        setTotalSpent(expensesData.expenses.reduce((sum, e) => sum + e.amount, 0));
        setMonthlyBudget(profileData.monthlyBudget ?? null);
      } catch {
        // A quiet preview card — the full Budget page is the source of truth.
      }
    }
    load();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fraction = monthlyBudget && totalSpent !== null ? totalSpent / monthlyBudget : 0;

  return (
    <div className={`flex-1 ${card}`}>
      <h2 className={`mb-2 ${sectionLabel}`}>💰 Budget</h2>
      {totalSpent === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      ) : monthlyBudget ? (
        <>
          <p className="text-sm text-ink dark:text-paper">
            {formatINR(totalSpent)} of {formatINR(monthlyBudget)}
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stone dark:bg-stone-dark">
            <div
              className={`h-full ${progressBarColor(fraction)}`}
              style={{ width: `${Math.min(fraction, 1) * 100}%` }}
            />
          </div>
        </>
      ) : (
        <p className="text-sm text-ink dark:text-paper">
          <span className="font-medium">{formatINR(totalSpent)}</span> spent this month
        </p>
      )}
      <Link to="/budget" className="mt-2 inline-block text-xs text-bloom hover:underline">
        {monthlyBudget ? "View budget →" : "Set a budget →"}
      </Link>
    </div>
  );
}
