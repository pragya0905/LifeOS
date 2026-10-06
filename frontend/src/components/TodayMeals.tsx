import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../api/useApi";
import { todayLocal } from "../lib/date";
import type { MealPlanSlot, MealPlanTemplate, MealType } from "../types";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";
import { card, mutedText, sectionLabel } from "./ui";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_TYPE_LABEL: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

function today(): string {
  return todayLocal();
}

export default function TodayMeals() {
  const { request } = useApi();
  const [meals, setMeals] = useState<Partial<Record<MealType, string>> | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const date = today();
        const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
        const [slotsData, templatesData] = await Promise.all([
          request<{ slots: MealPlanSlot[] }>(`/meal-plan?from=${date}&to=${date}`),
          request<{ templates: MealPlanTemplate[] }>("/meal-plan-templates"),
        ]);
        if (ignore) return;
        const next: Partial<Record<MealType, string>> = {};
        for (const t of templatesData.templates) {
          if (t.dayOfWeek === dayOfWeek) next[t.mealType] = t.text;
        }
        for (const s of slotsData.slots) next[s.mealType] = s.text;
        setMeals(next);
      } catch {
        // A quiet preview card — the full Meal Plan page is the source of truth.
      }
    }
    load();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plannedTypes = meals ? MEAL_TYPES.filter((mt) => meals[mt]) : [];

  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className={sectionLabel}>🍽️ Today's meals</h2>
        <Link to="/meal-plan" className="text-xs text-bloom hover:underline">
          Manage →
        </Link>
      </div>
      {!meals && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
        </div>
      )}
      {meals && plannedTypes.length === 0 && (
        <EmptyState
          icon="🍽️"
          title="Nothing planned for today"
          hint="Plan a meal or set a weekly default on the Meal Plan page."
        />
      )}
      {meals && plannedTypes.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {plannedTypes.map((mt) => (
            <li key={mt} className="flex items-baseline gap-2 text-sm">
              <span className={`w-16 shrink-0 ${mutedText}`}>{MEAL_TYPE_LABEL[mt]}</span>
              <span className="text-ink dark:text-paper">{meals[mt]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
