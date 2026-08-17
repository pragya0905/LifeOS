import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../api/useApi";
import ExtractionLedger from "../components/ExtractionLedger";
import TodayHabits from "../components/TodayHabits";
import TodaySchedule from "../components/TodaySchedule";
import TodaySummaryRings from "../components/TodaySummaryRings";
import WelcomeCard from "../components/WelcomeCard";
import type { Task } from "../types";
import {
  card,
  errorText,
  mutedText,
  page,
  pageTitle,
  priorityBadgeClass,
  sectionLabel,
} from "../components/ui";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Tasks with a due date/time come first (soonest first); undated tasks sort last.
function byUrgency(a: Task, b: Task): number {
  const aKey = a.dueDate ? `${a.dueDate}T${a.dueTime ?? "23:59"}` : null;
  const bKey = b.dueDate ? `${b.dueDate}T${b.dueTime ?? "23:59"}` : null;
  if (aKey && bKey) return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  if (aKey) return -1;
  if (bKey) return 1;
  return 0;
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
  const topTasks = pending.slice().sort(byUrgency).slice(0, 3);

  return (
    <div className={page}>
      <h1 className={pageTitle}>Dashboard</h1>

      <WelcomeCard />

      <div className="mb-6">
        <TodaySummaryRings />
      </div>

      <div className="mb-6">
        <TodaySchedule />
      </div>

      <div className="mb-6">
        <TodayHabits />
      </div>

      <div className="mb-6">
        <ExtractionLedger />
      </div>

      <div className="mb-6 flex flex-col gap-6 sm:flex-row">
        <div className={`flex-1 ${card}`}>
          <h2 className={`mb-2 ${sectionLabel}`}>Tasks</h2>
          {error && <p className={errorText}>{error}</p>}
          {!error && !tasks && <p className={mutedText}>Loading...</p>}
          {tasks && (
            <>
              <p className="mb-2 text-sm text-ink dark:text-cream">
                <span className="font-medium">{pending.length}</span> pending
                {overdue.length > 0 && (
                  <>
                    {" "}
                    ·{" "}
                    <span className="font-medium text-terracotta">
                      {overdue.length} overdue
                    </span>
                  </>
                )}
              </p>
              {topTasks.length > 0 && (
                <ul className="mb-2 flex flex-col gap-1.5">
                  {topTasks.map((task) => {
                    const isOverdue = Boolean(task.dueDate && task.dueDate < today());
                    return (
                      <li key={task.taskId} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate text-ink dark:text-cream">{task.title}</span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {task.dueDate && (
                            <span
                              className={`text-xs ${isOverdue ? "font-medium text-terracotta" : "text-ink-muted dark:text-fog-muted"}`}
                            >
                              {task.dueDate}
                              {task.dueTime ? ` ${task.dueTime}` : ""}
                            </span>
                          )}
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityBadgeClass[task.priority]}`}
                          >
                            {task.priority}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
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
