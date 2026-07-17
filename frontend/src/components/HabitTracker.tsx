import { useEffect, useState } from "react";
import { useApi } from "../api/useApi";
import type { HabitLog, HabitType, HabitUnit } from "../types";
import { card, errorText, input, mutedText, secondaryButton, sectionLabel } from "./ui";

const HABITS: { type: HabitType; label: string; unit: HabitUnit }[] = [
  { type: "water", label: "Water", unit: "ml" },
  { type: "exercise", label: "Exercise", unit: "minutes" },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function HabitTracker() {
  const { request } = useApi();
  const [date] = useState(today());
  const [values, setValues] = useState<Partial<Record<HabitType, number>>>({});
  const [drafts, setDrafts] = useState<Partial<Record<HabitType, string>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<HabitType | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await request<{ habits: HabitLog[] }>(`/habits/${date}`);
        const next: Partial<Record<HabitType, number>> = {};
        for (const habit of data.habits) next[habit.habitType] = habit.value ?? 0;
        setValues(next);
        setDrafts(
          Object.fromEntries(
            Object.entries(next).map(([type, value]) => [type, String(value)]),
          ),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load habits");
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function saveHabit(type: HabitType) {
    const draft = drafts[type] ?? "";
    const parsed = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(parsed) || parsed < 0) {
      setError("Enter a non-negative number");
      return;
    }
    setPending(type);
    setError(null);
    try {
      const updated = await request<HabitLog>(`/habits/${date}/${type}`, {
        method: "PATCH",
        body: JSON.stringify({ value: parsed }),
      });
      setValues((prev) => ({ ...prev, [type]: updated.value ?? 0 }));
      setDrafts((prev) => ({ ...prev, [type]: String(updated.value ?? 0) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update habit");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={card}>
      <h2 className={`mb-3 ${sectionLabel}`}>Today's habits ({date})</h2>
      {error && <p className={`mb-2 ${errorText}`}>{error}</p>}
      {loading ? (
        <p className={mutedText}>Loading...</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {HABITS.map(({ type, label: habitLabel, unit }) => (
            <li key={type} className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-ink dark:text-cream">
                {habitLabel}
                {values[type] !== undefined && (
                  <span className="ml-2 font-normal text-ink-muted dark:text-fog-muted">
                    ({values[type]} {unit})
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  placeholder={unit}
                  value={drafts[type] ?? ""}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [type]: e.target.value }))}
                  className={`w-20 py-1 ${input}`}
                />
                <button
                  type="button"
                  disabled={pending === type}
                  onClick={() => saveHabit(type)}
                  className={`${secondaryButton} px-3 py-1 text-xs`}
                >
                  {pending === type ? "Saving..." : "Save"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
