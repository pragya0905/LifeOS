import { useEffect, useState } from "react";
import { useApi } from "../api/useApi";
import { toLocalDateStr, todayLocal } from "../lib/date";
import { SkeletonCard } from "../components/Skeleton";
import type { MealPlanSlot, MealType } from "../types";
import { card, errorText, input, mutedText, page, pageTitle, primaryButton, secondaryButton } from "../components/ui";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_TYPE_LABEL: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

function startOfWeek(dateStr: string): Date {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  d.setDate(d.getDate() + diff);
  return d;
}

function weekDates(weekStartStr: string): string[] {
  const start = new Date(`${weekStartStr}T00:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return toLocalDateStr(d);
  });
}

function shiftWeek(weekStartStr: string, deltaWeeks: number): string {
  const d = new Date(`${weekStartStr}T00:00:00`);
  d.setDate(d.getDate() + deltaWeeks * 7);
  return toLocalDateStr(d);
}

function dayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function slotKey(date: string, mealType: MealType): string {
  return `${date}#${mealType}`;
}

export default function MealPlan() {
  const { request } = useApi();
  const [weekStart, setWeekStart] = useState(toLocalDateStr(startOfWeek(todayLocal())));
  const [slots, setSlots] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dates = weekDates(weekStart);
  const from = dates[0];
  const to = dates[dates.length - 1];

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);
    setPending({});
    request<{ slots: MealPlanSlot[] }>(`/meal-plan?from=${from}&to=${to}`)
      .then((data) => {
        if (ignore) return;
        const next: Record<string, string> = {};
        for (const s of data.slots) next[slotKey(s.date, s.mealType)] = s.text;
        setSlots(next);
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : "Failed to load meal plan");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  async function saveSlot(date: string, mealType: MealType, text: string) {
    const key = slotKey(date, mealType);
    const trimmed = text.trim();
    const existed = slots[key] !== undefined;
    try {
      if (!trimmed) {
        if (existed) {
          await request(`/meal-plan/${date}/${mealType}`, { method: "DELETE" });
          setSlots((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }
        return;
      }
      await request(`/meal-plan/${date}/${mealType}`, {
        method: "PATCH",
        body: JSON.stringify({ text: trimmed }),
      });
      setSlots((prev) => ({ ...prev, [key]: trimmed }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save meal plan slot");
    }
  }

  async function handleSuggest() {
    setSuggesting(true);
    setError(null);
    try {
      const data = await request<{ slots: { date: string; mealType: MealType; text: string }[] }>(
        "/meal-plan/suggest",
        { method: "POST", body: JSON.stringify({ from, to }) },
      );
      const next: Record<string, string> = {};
      for (const s of data.slots) next[slotKey(s.date, s.mealType)] = s.text;
      setPending(next);
      if (Object.keys(next).length === 0) {
        setError("Every slot this week is already planned — nothing empty to suggest.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get suggestions");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleSavePending() {
    setError(null);
    try {
      await Promise.all(
        Object.entries(pending).map(([key, text]) => {
          const [date, mealType] = key.split("#") as [string, MealType];
          return request(`/meal-plan/${date}/${mealType}`, {
            method: "PATCH",
            body: JSON.stringify({ text }),
          });
        }),
      );
      setSlots((prev) => ({ ...prev, ...pending }));
      setPending({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save suggestions");
    }
  }

  return (
    <div className={page}>
      <h1 className={pageTitle}>Meal Plan</h1>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-2">
          <button type="button" onClick={() => setWeekStart((w) => shiftWeek(w, -1))} className={secondaryButton}>
            ← Prev week
          </button>
          <button type="button" onClick={() => setWeekStart((w) => shiftWeek(w, 1))} className={secondaryButton}>
            Next week →
          </button>
        </div>
        <button type="button" onClick={handleSuggest} disabled={suggesting} className={primaryButton}>
          {suggesting ? "Thinking..." : "✨ Suggest with AI"}
        </button>
      </div>

      {error && <p className={`mb-4 ${errorText}`}>{error}</p>}

      {Object.keys(pending).length > 0 && (
        <div className={`mb-4 flex items-center justify-between ${card} border-bloom/40`}>
          <p className="text-sm text-ink dark:text-paper">
            Suggestions are shown below in the empty slots — review, then save or discard.
          </p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={handleSavePending} className={`${primaryButton} px-3 py-1.5 text-xs`}>
              Save plan
            </button>
            <button
              type="button"
              onClick={() => setPending({})}
              className={`${secondaryButton} px-3 py-1.5 text-xs`}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} lines={4} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {dates.map((date) => (
            <div key={date} className={card}>
              <h2 className="mb-2 text-sm font-medium text-ink dark:text-paper">
                {dayLabel(date)}
                {date === todayLocal() && <span className="ml-2 text-xs text-bloom">Today</span>}
              </h2>
              <div className="flex flex-col gap-2">
                {MEAL_TYPES.map((mealType) => {
                  const key = slotKey(date, mealType);
                  const pendingText = pending[key];
                  const value = pendingText ?? slots[key] ?? "";
                  return (
                    <div key={mealType} className="flex items-center gap-2">
                      <label className="w-20 shrink-0 text-xs text-ink-muted dark:text-mist-muted">
                        {MEAL_TYPE_LABEL[mealType]}
                      </label>
                      <input
                        type="text"
                        defaultValue={value}
                        key={value}
                        placeholder="Tap to plan this meal"
                        onBlur={(e) => {
                          if (pending[key] !== undefined) {
                            const trimmed = e.target.value.trim();
                            setPending((prev) => {
                              const next = { ...prev };
                              if (trimmed) next[key] = trimmed;
                              else delete next[key];
                              return next;
                            });
                          } else {
                            saveSlot(date, mealType, e.target.value);
                          }
                        }}
                        className={`flex-1 ${input} ${pendingText !== undefined ? "border-bloom" : ""}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && Object.keys(slots).length === 0 && Object.keys(pending).length === 0 && (
        <p className={`mt-3 ${mutedText}`}>Nothing planned yet — fill in a slot above or try Suggest with AI.</p>
      )}
    </div>
  );
}
