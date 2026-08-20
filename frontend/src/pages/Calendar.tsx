import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../api/useApi";
import type { Task } from "../types";
import {
  card,
  errorText,
  mutedText,
  page,
  pageTitle,
  priorityBadgeClass,
  secondaryButton,
} from "../components/ui";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthGrid(monthStart: Date): Date[] {
  const firstOfMonth = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - firstOfMonth.getDay());

  const days: Date[] = [];
  const cursor = new Date(gridStart);
  // 6 rows x 7 days covers every month layout without an extra trailing empty row.
  for (let i = 0; i < 42; i++) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export default function Calendar() {
  const { request } = useApi();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [monthStart, setMonthStart] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await request<{ tasks: Task[] }>("/tasks");
        if (!ignore) setTasks(data.tasks);
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : "Failed to load tasks");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tasksByDate = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.dueDate) continue;
    const list = tasksByDate.get(task.dueDate) ?? [];
    list.push(task);
    tasksByDate.set(task.dueDate, list);
  }

  const days = monthGrid(monthStart);
  const todayKey = toDateKey(new Date());
  const monthLabel = monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  function shiftMonth(delta: number) {
    setMonthStart((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  return (
    <div className={page}>
      <h1 className={pageTitle}>Calendar</h1>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => shiftMonth(-1)} className={`${secondaryButton} px-3 py-1 text-xs`}>
            ← Prev
          </button>
          <button
            type="button"
            onClick={() => setMonthStart(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })}
            className={`${secondaryButton} px-3 py-1 text-xs`}
          >
            Today
          </button>
          <button type="button" onClick={() => shiftMonth(1)} className={`${secondaryButton} px-3 py-1 text-xs`}>
            Next →
          </button>
        </div>
        <span className="font-display text-lg font-medium text-ink dark:text-paper">{monthLabel}</span>
      </div>

      {error && <p className={`mb-4 ${errorText}`}>{error}</p>}
      {loading ? (
        <p className={mutedText}>Loading...</p>
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <div className="grid min-w-[640px] grid-cols-7 gap-px bg-stone dark:bg-stone-dark">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="bg-paper-card px-2 py-1.5 text-center text-xs font-medium uppercase tracking-wide text-ink-muted dark:bg-ink-bg-card dark:text-mist-muted"
              >
                {label}
              </div>
            ))}
            {days.map((day) => {
              const key = toDateKey(day);
              const inMonth = day.getMonth() === monthStart.getMonth();
              const dayTasks = tasksByDate.get(key) ?? [];
              return (
                <div
                  key={key}
                  className={`min-h-[86px] bg-paper-card p-1.5 dark:bg-ink-bg-card ${
                    inMonth ? "" : "opacity-40"
                  } ${key === todayKey ? "ring-1 ring-inset ring-bloom" : ""}`}
                >
                  <p className="mb-1 text-xs text-ink-muted dark:text-mist-muted">{day.getDate()}</p>
                  <div className="flex flex-col gap-0.5">
                    {dayTasks.slice(0, 3).map((task) => (
                      <span
                        key={task.taskId}
                        title={task.title}
                        className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${priorityBadgeClass[task.priority]}`}
                      >
                        {task.title}
                      </span>
                    ))}
                    {dayTasks.length > 3 && (
                      <span className="text-[10px] text-ink-muted dark:text-mist-muted">
                        +{dayTasks.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <Link to="/tasks" className="mt-3 inline-block text-xs text-bloom hover:underline">
        Manage tasks →
      </Link>
    </div>
  );
}
