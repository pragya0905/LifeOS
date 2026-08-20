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

// Indian public holidays & major festivals for 2026 (national gazetted holidays plus
// widely-observed festivals). Islamic dates (Eid, Bakrid, Muharram, Id-e-Milad) follow the
// lunar calendar and are confirmed closer to the date — treat those as approximate.
const HOLIDAYS_2026: Record<string, string> = {
  "2026-01-01": "New Year's Day",
  "2026-01-14": "Makar Sankranti",
  "2026-01-26": "Republic Day",
  "2026-03-04": "Holi",
  "2026-03-21": "Id-ul-Fitr (Eid)",
  "2026-03-26": "Ram Navami",
  "2026-03-31": "Mahavir Jayanti",
  "2026-04-03": "Good Friday",
  "2026-05-01": "Buddha Purnima",
  "2026-05-27": "Id-ul-Zuha (Bakrid)",
  "2026-06-26": "Muharram",
  "2026-08-15": "Independence Day",
  "2026-08-26": "Id-e-Milad",
  "2026-08-28": "Raksha Bandhan",
  "2026-09-04": "Janmashtami",
  "2026-09-14": "Ganesh Chaturthi",
  "2026-10-02": "Gandhi Jayanti",
  "2026-10-20": "Dussehra",
  "2026-11-08": "Diwali",
  "2026-11-24": "Guru Nanak Jayanti",
  "2026-12-25": "Christmas",
};

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - 1 + i);
  const selectedDayTasks = selectedDay ? (tasksByDate.get(selectedDay) ?? []) : [];
  const selectedDayHoliday = selectedDay ? HOLIDAYS_2026[selectedDay] : undefined;
  const selectClass =
    "rounded-xl border border-stone bg-paper-card px-2 py-1 text-xs text-ink focus:border-bloom focus:outline-none dark:border-stone-dark dark:bg-ink-bg-card dark:text-paper";

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
        <div className="flex items-center gap-1.5">
          <select
            value={monthStart.getMonth()}
            onChange={(e) => setMonthStart((prev) => new Date(prev.getFullYear(), Number(e.target.value), 1))}
            aria-label="Jump to month"
            className={selectClass}
          >
            {MONTH_LABELS.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={monthStart.getFullYear()}
            onChange={(e) => setMonthStart((prev) => new Date(Number(e.target.value), prev.getMonth(), 1))}
            aria-label="Jump to year"
            className={selectClass}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className={`mb-4 ${errorText}`}>{error}</p>}
      {loading ? (
        <p className={mutedText}>Loading...</p>
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <div className="grid min-w-[640px] grid-cols-7 gap-px bg-stone dark:bg-stone-dark">
            {WEEKDAY_LABELS.map((label, i) => (
              <div
                key={label}
                className={`bg-paper-card px-2 py-1.5 text-center text-xs font-medium uppercase tracking-wide dark:bg-ink-bg-card ${
                  i === 0 || i === 6 ? "text-bloom" : "text-ink-muted dark:text-mist-muted"
                }`}
              >
                {label}
              </div>
            ))}
            {days.map((day) => {
              const key = toDateKey(day);
              const inMonth = day.getMonth() === monthStart.getMonth();
              const dayTasks = tasksByDate.get(key) ?? [];
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              const holiday = HOLIDAYS_2026[key];
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => setSelectedDay(key)}
                  aria-label={`View ${key}${holiday ? `, ${holiday}` : ""}${dayTasks.length ? `, ${dayTasks.length} task${dayTasks.length === 1 ? "" : "s"}` : ""}`}
                  className={`min-h-[86px] p-1.5 text-left transition-colors hover:brightness-95 dark:hover:brightness-125 ${
                    isWeekend ? "bg-bloom-soft/40 dark:bg-bloom-soft-dark/30" : "bg-paper-card dark:bg-ink-bg-card"
                  } ${inMonth ? "" : "opacity-40"} ${key === todayKey ? "ring-1 ring-inset ring-bloom" : ""}`}
                >
                  <p
                    className={`mb-1 text-xs ${
                      isWeekend ? "font-medium text-bloom" : "text-ink-muted dark:text-mist-muted"
                    }`}
                  >
                    {day.getDate()}
                  </p>
                  {holiday && (
                    <p
                      title={holiday}
                      className="mb-1 truncate rounded bg-amber-soft px-1 py-0.5 text-[10px] font-medium text-amber-ink dark:bg-amber-soft-dark dark:text-amber-ink-dark"
                    >
                      🎉 {holiday}
                    </p>
                  )}
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
                </button>
              );
            })}
          </div>
        </div>
      )}
      <Link to="/tasks" className="mt-3 inline-block text-xs text-bloom hover:underline">
        Manage tasks →
      </Link>

      {selectedDay && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setSelectedDay(null)}
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm dark:bg-ink-bg/70"
          />
          <div className="animate-fade-in-up relative w-full max-w-2xl rounded-t-3xl border border-b-0 border-stone bg-paper-card p-5 pb-8 dark:border-stone-dark dark:bg-ink-bg-card">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-stone dark:bg-stone-dark" />
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-lg font-medium text-ink dark:text-paper">
                  {new Date(`${selectedDay}T00:00:00`).toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                {selectedDayHoliday && (
                  <p className="mt-1 inline-block rounded-full bg-amber-soft px-2 py-0.5 text-xs font-medium text-amber-ink dark:bg-amber-soft-dark dark:text-amber-ink-dark">
                    🎉 {selectedDayHoliday}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-stone/40 dark:text-mist-muted dark:hover:bg-stone-dark/40"
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {selectedDayTasks.length === 0 ? (
              <p className={`mb-4 ${mutedText}`}>No tasks due this day.</p>
            ) : (
              <ul className="mb-4 flex flex-col gap-2">
                {selectedDayTasks.map((task) => (
                  <li
                    key={task.taskId}
                    className="flex items-center justify-between gap-2 rounded-xl border border-stone px-3 py-2 dark:border-stone-dark"
                  >
                    <span
                      className={`truncate text-sm ${
                        task.status === "done" ? "text-ink-muted line-through dark:text-mist-muted" : "text-ink dark:text-paper"
                      }`}
                    >
                      {task.title}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityBadgeClass[task.priority]}`}
                    >
                      {task.priority}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <Link
              to={`/tasks?date=${selectedDay}`}
              className="block w-full rounded-full bg-bloom px-5 py-2 text-center text-sm font-medium text-paper-card transition-colors hover:bg-bloom-light"
            >
              ➕ Add task for this day
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
