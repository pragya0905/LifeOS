import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../api/useApi";
import { todayLocal } from "../lib/date";
import { EXPENSE_CATEGORY_EMOJI, EXPENSE_CATEGORY_LABEL, formatINR } from "../lib/expenseCategories";
import type { Expense } from "../types";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";
import { card, mutedText, sectionLabel } from "./ui";

function today(): string {
  return todayLocal();
}

export default function TodayExpenses() {
  const { request } = useApi();
  const [expenses, setExpenses] = useState<Expense[] | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const date = today();
        const data = await request<{ expenses: Expense[] }>(`/expenses?from=${date}&to=${date}`);
        if (!ignore) setExpenses(data.expenses);
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

  const total = expenses?.reduce((sum, e) => sum + e.amount, 0) ?? 0;

  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className={sectionLabel}>💸 Today's expenses</h2>
        <Link to="/budget" className="text-xs text-bloom hover:underline">
          Manage →
        </Link>
      </div>
      {!expenses && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
        </div>
      )}
      {expenses && expenses.length === 0 && (
        <EmptyState icon="💸" title="Nothing spent today" hint="Log an expense on the Budget page." />
      )}
      {expenses && expenses.length > 0 && (
        <>
          <ul className="mb-2 flex flex-col gap-1.5">
            {expenses.map((e) => (
              <li key={e.expenseId} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-ink dark:text-paper">
                  {EXPENSE_CATEGORY_EMOJI[e.category]} {EXPENSE_CATEGORY_LABEL[e.category]}
                  {e.note && <span className={`ml-1.5 ${mutedText}`}>— {e.note}</span>}
                </span>
                <span className="shrink-0 font-medium text-ink dark:text-paper">{formatINR(e.amount)}</span>
              </li>
            ))}
          </ul>
          <p className={`text-xs ${mutedText}`}>
            <span className="font-medium text-ink dark:text-paper">{formatINR(total)}</span> spent today
          </p>
        </>
      )}
    </div>
  );
}
