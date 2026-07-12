import { useEffect, useState } from "react";
import { useApi } from "../api/useApi";
import type { HabitLog, HabitStatus, HabitType } from "../types";

const HABITS: { type: HabitType; label: string }[] = [
  { type: "water", label: "Water" },
  { type: "exercise", label: "Exercise" },
  { type: "medicine", label: "Medicine" },
];

const STATUS_OPTIONS: { status: HabitStatus; label: string }[] = [
  { status: "done", label: "Done" },
  { status: "missed", label: "Missed" },
  { status: "skipped", label: "Skipped" },
];

const ACTIVE_CLASS: Record<HabitStatus, string> = {
  done: "bg-green-600 text-white border-green-600",
  missed: "bg-red-600 text-white border-red-600",
  skipped: "bg-gray-500 text-white border-gray-500",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function HabitTracker() {
  const { request } = useApi();
  const [date] = useState(today());
  const [statuses, setStatuses] = useState<Partial<Record<HabitType, HabitStatus>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<HabitType | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await request<{ habits: HabitLog[] }>(`/habits/${date}`);
        const next: Partial<Record<HabitType, HabitStatus>> = {};
        for (const habit of data.habits) next[habit.habitType] = habit.status;
        setStatuses(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load habits");
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function setHabit(type: HabitType, status: HabitStatus) {
    setPending(type);
    setError(null);
    try {
      const updated = await request<HabitLog>(`/habits/${date}/${type}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setStatuses((prev) => ({ ...prev, [type]: updated.status }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update habit");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="rounded-md border border-gray-200 p-4 dark:border-gray-700">
      <h2 className="mb-3 text-sm font-medium text-gray-500 dark:text-gray-400">
        Today's habits ({date})
      </h2>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {HABITS.map(({ type, label }) => {
            const current = statuses[type];
            return (
              <li key={type} className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {label}
                </span>
                <div className="flex gap-1.5">
                  {STATUS_OPTIONS.map(({ status, label: statusLabel }) => (
                    <button
                      key={status}
                      type="button"
                      disabled={pending === type}
                      onClick={() => setHabit(type, status)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-50 ${
                        current === status
                          ? ACTIVE_CLASS[status]
                          : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
                      }`}
                    >
                      {statusLabel}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
