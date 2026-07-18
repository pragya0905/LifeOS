import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../api/useApi";
import TodayHabits from "../components/TodayHabits";
import TodaySchedule from "../components/TodaySchedule";
import type { Task } from "../types";
import { card, errorText, mutedText, page, pageTitle, sectionLabel } from "../components/ui";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Dashboard() {
  const { request } = useApi();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function loadTasks() {
      try {
        const data = await request<{ tasks: Task[] }>("/tasks");
        if (!ignore) setTasks(data.tasks);
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : "Failed to load tasks");
      }
    }
    loadTasks();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pending = tasks?.filter((t) => t.status !== "done") ?? [];
  const overdue = pending.filter((t) => t.dueDate && t.dueDate < today());

  return (
    <div className={page}>
      <h1 className={pageTitle}>Dashboard</h1>

      <div className="mb-6">
        <TodaySchedule />
      </div>

      <div className="mb-6">
        <TodayHabits />
      </div>

      <div className="mb-6 flex flex-col gap-6 sm:flex-row">
        <div className={`flex-1 ${card}`}>
          <h2 className={`mb-2 ${sectionLabel}`}>Tasks</h2>
          {error && <p className={errorText}>{error}</p>}
          {!error && !tasks && <p className={mutedText}>Loading...</p>}
          {tasks && (
            <p className="text-sm text-ink dark:text-cream">
              <span className="font-medium">{pending.length}</span> pending
              {overdue.length > 0 && (
                <>
                  {" "}
                  · <span className="font-medium text-terracotta">{overdue.length} overdue</span>
                </>
              )}
            </p>
          )}
          <Link to="/tasks" className="mt-1 inline-block text-xs text-sage hover:underline">
            Manage tasks →
          </Link>
        </div>

        <div className={`flex-1 ${card}`}>
          <h2 className={`mb-2 ${sectionLabel}`}>Insights</h2>
          <p className={mutedText}>See patterns and suggestions from your recent activity.</p>
          <Link to="/insights" className="mt-1 inline-block text-xs text-sage hover:underline">
            View insights →
          </Link>
        </div>
      </div>
    </div>
  );
}
