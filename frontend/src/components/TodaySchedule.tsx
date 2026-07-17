import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../api/useApi";
import type { Schedule, TaskPriority } from "../types";
import { card, errorText, mutedText, sectionLabel } from "./ui";

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  Low: "bg-stone text-ink-muted dark:bg-stone-dark dark:text-fog-muted",
  Medium: "bg-[#F0E4C8] text-[#8A6A22] dark:bg-[#4A3D1E] dark:text-[#E3C878]",
  High: "bg-terracotta-soft text-terracotta dark:bg-terracotta-soft-dark dark:text-[#D89478]",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function TodaySchedule() {
  const { request } = useApi();
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await request<Schedule>(`/schedule/${today()}`);
        if (ignore) return;
        setSchedule(data);
      } catch (err) {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Failed to load schedule");
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

  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className={sectionLabel}>Today's schedule ({today()})</h2>
        <Link to="/tasks" className="text-xs text-sage hover:underline">
          Manage tasks
        </Link>
      </div>
      {error && <p className={errorText}>{error}</p>}
      {loading ? (
        <p className={mutedText}>Loading...</p>
      ) : !schedule || schedule.tasks.length === 0 ? (
        <p className={mutedText}>Nothing due today.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {schedule.tasks.map((task) => (
            <li
              key={task.taskId}
              className="flex items-center justify-between gap-3 rounded-xl border border-stone/60 px-3 py-2 dark:border-stone-dark/60"
            >
              <div>
                <p
                  className={`text-sm font-medium text-ink dark:text-cream ${
                    task.status === "done" ? "line-through opacity-60" : ""
                  }`}
                >
                  {task.title}
                </p>
                <p className="text-xs text-ink-muted dark:text-fog-muted">
                  {task.scheduleTime ?? "No set time"}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE[task.priority]}`}
                title={`Priority source: ${task.prioritySource}`}
              >
                {task.priority}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
