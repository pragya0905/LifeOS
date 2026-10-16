import { Check } from "lucide-react";
import type { Task } from "../types";
import { checkAnimationClass } from "../lib/preferences";
import { formatDueTime } from "../lib/date";
import { Icon } from "./Icon";
import { mutedText, sectionLabel } from "./ui";

export interface TaskRowAction {
  task: Task;
  overdue: boolean;
  pending: boolean;
  onComplete: () => void;
}

// Overdue first, then due-today-by-time, then "Anytime" (due today, no specific time) — no
// per-row "..." menu here: a task only has done/not-done, there's no richer status set the
// way routine steps and medications have.
export function TodayTasksSection({ rows }: { rows: TaskRowAction[] }) {
  if (rows.length === 0) {
    return <p className={mutedText}>No tasks due today.</p>;
  }

  const overdue = rows.filter((r) => r.overdue);
  const timed = rows.filter((r) => !r.overdue && r.task.dueTime);
  const anytime = rows.filter((r) => !r.overdue && !r.task.dueTime);

  return (
    <div className="flex flex-col gap-3">
      {overdue.length > 0 && <TaskGroup label="Overdue" rows={overdue} />}
      {timed.length > 0 && <TaskGroup rows={timed.sort((a, b) => (a.task.dueTime ?? "").localeCompare(b.task.dueTime ?? ""))} />}
      {anytime.length > 0 && <TaskGroup label="Anytime" rows={anytime} />}
    </div>
  );
}

function TaskGroup({ label, rows }: { label?: string; rows: TaskRowAction[] }) {
  return (
    <div>
      {label && <p className={`mb-1.5 ${sectionLabel}`}>{label}</p>}
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <TaskRow key={r.task.taskId} {...r} />
        ))}
      </ul>
    </div>
  );
}

function TaskRow({ task, overdue, pending, onComplete }: TaskRowAction) {
  const completed = task.status === "done";
  return (
    <li className={`flex min-h-12 items-center gap-3 rounded-control px-2 py-2 ${completed ? "opacity-60" : ""}`}>
      <button
        type="button"
        disabled={pending || completed}
        onClick={onComplete}
        aria-label={completed ? `${task.title} done` : `Mark ${task.title} done`}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-60 ${
          completed
            ? `border-success bg-success text-paper-card ${checkAnimationClass()}`
            : "border-stone text-ink-muted hover:bg-stone/40 dark:border-stone-dark dark:text-mist-muted dark:hover:bg-stone-dark/40"
        }`}
      >
        <Icon icon={Check} size={14} strokeWidth={2.4} />
      </button>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm text-ink dark:text-paper ${completed ? "line-through" : ""}`}>{task.title}</p>
        {(overdue || task.dueTime) && (
          <p className={`truncate text-xs tabular-nums ${overdue ? "font-medium text-alert" : "text-ink-muted dark:text-mist-muted"}`}>
            {overdue
              ? `Overdue — was due ${task.dueDate}${task.dueTime ? ` ${formatDueTime(task.dueTime)}` : ""}`
              : formatDueTime(task.dueTime)}
          </p>
        )}
      </div>
    </li>
  );
}
