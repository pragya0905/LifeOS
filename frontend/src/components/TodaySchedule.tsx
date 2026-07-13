import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../api/useApi";
import type { Schedule, TaskPriority } from "../types";

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  Low: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  Medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  High: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
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
    <div className="rounded-md border border-gray-200 p-4 dark:border-gray-700">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Today's schedule ({today()})
        </h2>
        <Link to="/tasks" className="text-xs text-indigo-600 hover:underline">
          Manage tasks
        </Link>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : !schedule || schedule.tasks.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing due today.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {schedule.tasks.map((task) => (
            <li
              key={task.taskId}
              className="flex items-center justify-between gap-3 rounded-md border border-gray-100 px-3 py-2 dark:border-gray-800"
            >
              <div>
                <p
                  className={`text-sm font-medium text-gray-900 dark:text-gray-100 ${
                    task.status === "done" ? "line-through opacity-60" : ""
                  }`}
                >
                  {task.title}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
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
