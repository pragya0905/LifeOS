import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../api/useApi";
import { todayLocal } from "../lib/date";
import type { Schedule, TaskPriority } from "../types";
import { Skeleton } from "./Skeleton";
import { card, errorText, mutedText, sectionLabel } from "./ui";

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  Low: "bg-stone text-ink-muted dark:bg-stone-dark dark:text-mist-muted",
  Medium: "bg-amber-soft text-amber-ink dark:bg-amber-soft-dark dark:text-amber-ink-dark",
  High: "bg-alert-soft text-alert dark:bg-alert-soft-dark dark:text-alert-light",
};

function today(): string {
  return todayLocal();
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
        <Link to="/tasks" className="text-xs text-bloom hover:underline">
          Manage tasks
        </Link>
      </div>
      {error && <p className={errorText}>{error}</p>}
      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-5/6" />
          <Skeleton className="h-5 w-2/3" />
        </div>
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
                  className={`text-sm font-medium text-ink dark:text-paper ${
                    task.status === "done" ? "line-through opacity-60" : ""
                  }`}
                >
                  {task.title}
                </p>
                <p className="text-xs text-ink-muted dark:text-mist-muted">
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
