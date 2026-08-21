import { useEffect, useRef, useState, type FormEvent, type TouchEvent as ReactTouchEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useApi } from "../api/useApi";
import { useSpeechToText } from "../hooks/useSpeechToText";
import { todayLocal, toLocalDateStr } from "../lib/date";
import { Skeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import type { Task, TaskPriority, TaskStatus } from "../types";
import {
  badge,
  card,
  errorText,
  input,
  label,
  mutedText,
  page,
  pageTitle,
  pillButton,
  pillButtonInactive,
  primaryButton,
  priorityBadgeClass,
  secondaryButton,
  sectionLabel,
} from "../components/ui";

const PRIORITIES: TaskPriority[] = ["Low", "Medium", "High"];

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

function joinText(base: string, addition: string): string {
  if (!addition) return base;
  if (!base) return addition;
  return base.endsWith(" ") ? base + addition : `${base} ${addition}`;
}

function dateOffsetDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalDateStr(d);
}

const DATE_PRESETS: { label: string; days: number }[] = [
  { label: "Today", days: 0 },
  { label: "Tomorrow", days: 1 },
  { label: "Next week", days: 7 },
];

// The browser is the only place that actually knows the user's timezone — computed here
// (not on the server) so the reminder scheduler can compare due times in UTC without
// having to guess what timezone dueDate/dueTime were entered in.
function computeDueAtUtc(dueDate: string, dueTime: string): string | undefined {
  if (!dueDate || !dueTime) return undefined;
  const d = new Date(`${dueDate}T${dueTime}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function hoursUntilDue(task: Task, now: Date): number | null {
  if (!task.dueDate) return null;
  const due = new Date(`${task.dueDate}T${task.dueTime ?? "23:59"}`);
  if (Number.isNaN(due.getTime())) return null;
  return (due.getTime() - now.getTime()) / 3600000;
}

// Mirrors the deterministic guardrail in backend suggestTaskPriority: once the
// remaining time no longer exceeds the estimated effort, priority is forced High.
function TaskTimeline({ task }: { task: Task }) {
  if (!task.dueDate || task.estimatedHours === undefined) return null;
  const now = new Date();
  const remaining = hoursUntilDue(task, now);
  if (remaining === null) return null;

  // "forced" is a live recomputation against the current clock — it can go true well after
  // the task was created/last suggested, so it must never claim priority IS High unless that's
  // actually the stored value; otherwise it visibly contradicts the priority badge above it.
  const forced = remaining <= task.estimatedHours;
  const staleForced = forced && task.priority !== "High";
  const dueLabel = task.dueTime ? `${task.dueDate} ${task.dueTime}` : task.dueDate;

  // Bar spans now (0%) to due (100%); the trigger marker sits at due - estimate,
  // i.e. where remaining time stops exceeding the estimated effort.
  const windowHours = Math.max(remaining, 1);
  const triggerHoursFromNow = remaining - task.estimatedHours;
  const triggerPct = Math.min(Math.max((triggerHoursFromNow / windowHours) * 100, 0), 100);

  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-1.5 overflow-visible rounded-full bg-stone dark:bg-stone-dark">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-bloom/50"
          style={{ width: `${triggerPct}%` }}
        />
        <div
          className="absolute -top-[3px] h-3 w-0.5 rounded-sm bg-amber"
          style={{ left: `${triggerPct}%` }}
          title="Priority forced High from here"
        />
        <div
          className="absolute -top-[3px] right-0 h-3 w-0.5 rounded-sm bg-alert"
          title="Due"
        />
      </div>
      <div className="flex justify-between text-[10px] uppercase tracking-[0.1em] text-mist-muted">
        <span>Now</span>
        <span>Due {dueLabel}</span>
      </div>
      {forced && !staleForced && (
        <p className="mt-1 rounded-lg border border-amber/50 bg-amber-soft/40 px-2.5 py-1.5 text-xs text-amber-ink dark:border-amber-soft-dark dark:bg-amber-soft-dark/40 dark:text-amber-ink-dark">
          Forced to High — {task.estimatedHours}h of work no longer fits before {dueLabel}
        </p>
      )}
      {staleForced && (
        <p className="mt-1 rounded-lg border border-stone bg-stone/30 px-2.5 py-1.5 text-xs text-ink-muted dark:border-stone-dark dark:bg-stone-dark/30 dark:text-mist-muted">
          {task.estimatedHours}h of work no longer fits before {dueLabel} — priority is still{" "}
          {task.priority} since it hasn't been re-suggested since this deadline got close.
        </p>
      )}
    </div>
  );
}

const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
};

const PRIORITY_EMOJI: Record<TaskPriority, string> = {
  Low: "🟢",
  Medium: "🟡",
  High: "🔴",
};

// A single click-to-cycle control (todo -> in_progress -> done -> todo) instead of a
// plain dropdown, so the most common action (marking progress) is one tap/click away.
function StatusToggle({ status, onCycle }: { status: TaskStatus; onCycle: () => void }) {
  return (
    <button
      type="button"
      onClick={onCycle}
      title={`Status: ${STATUS_LABEL[status]} — click to advance`}
      className="group flex items-center gap-1.5 rounded-full border border-stone py-1 pl-1 pr-2.5 text-xs font-medium text-ink transition-colors hover:bg-stone/40 dark:border-stone-dark dark:text-paper dark:hover:bg-stone-dark/40"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle
          cx="8"
          cy="8"
          r="6.5"
          fill={status === "done" ? "currentColor" : "none"}
          className={
            status === "done"
              ? "text-bloom"
              : status === "in_progress"
                ? "text-amber"
                : "text-mist-muted"
          }
          strokeWidth={status === "done" ? 0 : 1.75}
          stroke="currentColor"
          strokeDasharray={status === "in_progress" ? "6 4" : undefined}
        />
        {status === "done" && (
          <path
            d="M5 8.2l2 2 4-4.4"
            stroke="var(--color-paper-card)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        )}
      </svg>
      {STATUS_LABEL[status]}
    </button>
  );
}

// Small ring (visually consistent with the Dashboard's habit rings) showing how much of the
// remaining time-before-due the estimated effort would consume — inverted color from the
// Dashboard rings on purpose: here a HIGH fraction means urgent (red), not "closer to goal".
function DeadlineRing({ task }: { task: Task }) {
  if (!task.dueDate) return null;
  const remaining = hoursUntilDue(task, new Date());
  if (remaining === null) return null;

  let fraction: number;
  if (remaining <= 0) {
    fraction = 1;
  } else if (task.estimatedHours) {
    fraction = Math.min(task.estimatedHours / remaining, 1);
  } else {
    const daysLeft = remaining / 24;
    fraction = daysLeft < 1 ? 0.9 : daysLeft < 3 ? 0.6 : daysLeft < 7 ? 0.3 : 0.1;
  }

  const SIZE = 30;
  const STROKE = 4;
  const RADIUS = (SIZE - STROKE) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const offset = CIRCUMFERENCE * (1 - fraction);
  const colorClass = fraction >= 0.67 ? "stroke-alert" : fraction >= 0.34 ? "stroke-amber" : "stroke-bloom";

  return (
    <div
      className="relative shrink-0"
      style={{ width: SIZE, height: SIZE }}
      title={remaining <= 0 ? "Overdue" : `${remaining.toFixed(1)}h remaining until due`}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Time until due">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-stone dark:stroke-stone-dark"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          className={`${colorClass} transition-[stroke-dashoffset,stroke] duration-500`}
        />
      </svg>
    </div>
  );
}

const SWIPE_THRESHOLD = 90;

// Module-level (not nested in Tasks) so React doesn't remount it — and lose local
// swipe-gesture state — on every parent re-render, same fix applied to WishCard earlier.
function TaskCard({
  task,
  isEditing,
  onToggleEdit,
  onUpdate,
  onDuplicate,
  editDescription,
  setEditDescription,
  editDueDate,
  setEditDueDate,
  editDueTime,
  setEditDueTime,
  editEstimatedHours,
  setEditEstimatedHours,
  editSuggestPriority,
  setEditSuggestPriority,
  savingEdit,
  onSaveEdit,
  selectClass,
}: {
  task: Task;
  isEditing: boolean;
  onToggleEdit: () => void;
  onUpdate: (patch: Record<string, unknown>) => Promise<boolean>;
  onDuplicate: () => void;
  editDescription: string;
  setEditDescription: (v: string) => void;
  editDueDate: string;
  setEditDueDate: (v: string) => void;
  editDueTime: string;
  setEditDueTime: (v: string) => void;
  editEstimatedHours: string;
  setEditEstimatedHours: (v: string) => void;
  editSuggestPriority: boolean;
  setEditSuggestPriority: (v: boolean) => void;
  savingEdit: boolean;
  onSaveEdit: () => void;
  selectClass: string;
}) {
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const startXRef = useRef<number | null>(null);

  function onTouchStart(e: ReactTouchEvent) {
    if (task.status === "done") return;
    startXRef.current = e.touches[0].clientX;
    setSwiping(true);
  }
  function onTouchMove(e: ReactTouchEvent) {
    if (startXRef.current === null) return;
    const dx = e.touches[0].clientX - startXRef.current;
    if (dx > 0) setSwipeX(Math.min(dx, 130));
  }
  async function onTouchEnd() {
    if (swipeX > SWIPE_THRESHOLD) {
      // Hold the swipe position (don't snap back yet) while the PATCH is in flight — resetting
      // immediately made the card look "unswiped and still not done" for the round-trip
      // duration. On success the card leaves this section before the reset below is visible;
      // on failure it snaps back, which is correct since nothing changed.
      setSwipeX(SWIPE_THRESHOLD);
      setSwiping(false);
      await onUpdate({ status: "done" });
    }
    setSwipeX(0);
    setSwiping(false);
    startXRef.current = null;
  }

  return (
    <li className="relative animate-fade-in-up overflow-hidden rounded-2xl">
      <div
        className="absolute inset-0 flex items-center gap-2 rounded-2xl bg-bloom px-5 text-paper-card"
        aria-hidden="true"
        style={{ opacity: Math.min(swipeX / SWIPE_THRESHOLD, 1) }}
      >
        <svg width="20" height="20" viewBox="0 0 16 16">
          <path
            d="M3 8.5l3 3 7-7.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
        Done
      </div>
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(${swipeX}px)`,
          transition: swiping ? "none" : "transform 0.25s ease-out",
        }}
        className={`relative flex flex-col gap-3 border-l-4 transition-shadow hover:shadow-md ${card} ${
          task.priority === "High"
            ? "border-l-alert"
            : task.priority === "Medium"
              ? "border-l-amber"
              : "border-l-mist-muted"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <DeadlineRing task={task} />
            <div className="min-w-0">
              <p
                className={`font-medium text-ink dark:text-paper ${
                  task.status === "done" ? "line-through opacity-60" : ""
                }`}
              >
                {task.title}
              </p>
              {task.description && (
                <p className="mt-0.5 max-w-md text-sm text-ink-muted dark:text-mist-muted">
                  {task.description}
                </p>
              )}
              <p className="text-xs text-ink-muted dark:text-mist-muted">
                {task.dueDate ?? "No due date"}
                {task.dueTime ? ` ${task.dueTime}` : ""}
                {task.estimatedHours !== undefined ? ` · ~${task.estimatedHours}h` : ""}
                {task.scheduleTime ? ` · scheduled ${task.scheduleTime}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${priorityBadgeClass[task.priority]}`}
              title={`Priority source: ${task.prioritySource}`}
            >
              <span aria-hidden="true">{PRIORITY_EMOJI[task.priority]}</span>
              {task.priority}
            </span>
            {task.prioritySource === "ai" && <span className={badge}>AI</span>}
            <select
              value={task.priority}
              onChange={(e) => onUpdate({ priority: e.target.value as TaskPriority })}
              className={selectClass}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <StatusToggle status={task.status} onCycle={() => onUpdate({ status: STATUS_CYCLE[task.status] })} />
            <button
              type="button"
              onClick={onToggleEdit}
              className={`${secondaryButton} px-2 py-1 text-xs`}
            >
              {isEditing ? "Cancel" : "Edit"}
            </button>
            <button
              type="button"
              onClick={onDuplicate}
              title="Create a new task with the same title, priority, and estimate"
              className={`${secondaryButton} px-2 py-1 text-xs`}
            >
              Duplicate
            </button>
          </div>
        </div>

        <TaskTimeline task={task} />

        {isEditing && (
          <div className="flex flex-wrap items-end gap-3 border-t border-stone/60 pt-3 dark:border-stone-dark/60">
            <div className="min-w-[200px] flex-1">
              <label className={label}>Description (optional)</label>
              <input
                type="text"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Notes, links, anything you'll want later"
                className={`w-full ${input}`}
              />
            </div>
            <div>
              <label className={label}>Due date</label>
              <input
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
                className={input}
              />
              <div className="mt-1.5 flex gap-1.5">
                {DATE_PRESETS.map((preset) => {
                  const presetDate = dateOffsetDays(preset.days);
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setEditDueDate(presetDate)}
                      className={`${pillButton} ${
                        editDueDate === presetDate ? "border-bloom bg-bloom text-paper-card" : pillButtonInactive
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className={label}>Due time</label>
              <input
                type="time"
                value={editDueTime}
                onChange={(e) => setEditDueTime(e.target.value)}
                className={input}
              />
            </div>
            <div>
              <label className={label}>Est. hours</label>
              <input
                type="number"
                min={0}
                step="0.5"
                value={editEstimatedHours}
                onChange={(e) => setEditEstimatedHours(e.target.value)}
                className={`w-20 ${input}`}
              />
            </div>
            <label className={`flex items-center gap-1.5 pb-2 ${label}`}>
              <input
                type="checkbox"
                checked={editSuggestPriority}
                onChange={(e) => setEditSuggestPriority(e.target.checked)}
                className="rounded border-stone text-bloom focus:ring-bloom dark:border-stone-dark"
              />
              Re-suggest priority with AI
            </label>
            <button type="button" disabled={savingEdit} onClick={onSaveEdit} className={primaryButton}>
              {savingEdit ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

type TaskGroup = "Overdue" | "Today" | "Upcoming" | "No due date" | "Done";
const GROUP_ORDER: TaskGroup[] = ["Overdue", "Today", "Upcoming", "No due date", "Done"];
const GROUP_EMOJI: Record<TaskGroup, string> = {
  Overdue: "🔥",
  Today: "☀️",
  Upcoming: "📅",
  "No due date": "📌",
  Done: "✅",
};

function taskGroup(task: Task, today: string): TaskGroup {
  if (task.status === "done") return "Done";
  if (!task.dueDate) return "No due date";
  if (task.dueDate < today) return "Overdue";
  if (task.dueDate === today) return "Today";
  return "Upcoming";
}

export default function Tasks() {
  const { request } = useApi();
  const [searchParams] = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // Pre-filled when arriving from the Calendar page's "Add task for this day" link.
  const [dueDate, setDueDate] = useState(() => searchParams.get("date") ?? "");
  const [dueTime, setDueTime] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [scheduleTime, setScheduleTime] = useState("");
  const [suggestPriority, setSuggestPriority] = useState(true);
  const [creating, setCreating] = useState(false);
  const [usedVoice, setUsedVoice] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editDueTime, setEditDueTime] = useState("");
  const [editEstimatedHours, setEditEstimatedHours] = useState("");
  const [editSuggestPriority, setEditSuggestPriority] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const baseTitleRef = useRef("");

  const {
    supported: voiceSupported,
    listening,
    error: voiceError,
    start: startListening,
    stop: stopListening,
  } = useSpeechToText((transcript, isFinal) => {
    setTitle(joinText(baseTitleRef.current, transcript));
    if (isFinal) setUsedVoice(true);
  });

  const baseDescriptionRef = useRef("");

  const {
    supported: descriptionVoiceSupported,
    listening: descriptionListening,
    error: descriptionVoiceError,
    start: startDescriptionListening,
    stop: stopDescriptionListening,
  } = useSpeechToText((transcript, isFinal) => {
    setDescription(joinText(baseDescriptionRef.current, transcript));
    if (isFinal) setUsedVoice(true);
  });

  useEffect(() => {
    let ignore = false;

    async function loadTasks() {
      setLoading(true);
      setError(null);
      try {
        const data = await request<{ tasks: Task[] }>("/tasks");
        if (ignore) return;
        setTasks(data.tasks);
      } catch (err) {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Failed to load tasks");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadTasks();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleToggleVoice() {
    if (listening) {
      stopListening();
      return;
    }
    baseTitleRef.current = title;
    startListening();
  }

  function handleToggleDescriptionVoice() {
    if (descriptionListening) {
      stopDescriptionListening();
      return;
    }
    baseDescriptionRef.current = description;
    startDescriptionListening();
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (listening) stopListening();
    if (descriptionListening) stopDescriptionListening();
    setCreating(true);
    setError(null);
    try {
      const task = await request<Task>("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          dueDate: dueDate || undefined,
          dueTime: dueTime || undefined,
          dueAtUtc: computeDueAtUtc(dueDate, dueTime),
          estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
          voiceInput: usedVoice,
          priority,
          scheduleTime: scheduleTime || undefined,
          suggestPriority: suggestPriority || undefined,
        }),
      });
      setTasks((prev) => [task, ...prev]);
      setTitle("");
      setDescription("");
      setDueDate("");
      setDueTime("");
      setEstimatedHours("");
      setScheduleTime("");
      setPriority("Medium");
      setSuggestPriority(true);
      setUsedVoice(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setCreating(false);
    }
  }

  async function updateTask(taskId: string, patch: Record<string, unknown>): Promise<boolean> {
    setError(null);
    try {
      const updated = await request<Task>(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setTasks((prev) => prev.map((t) => (t.taskId === taskId ? updated : t)));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update task");
      return false;
    }
  }

  async function duplicateTask(task: Task) {
    setError(null);
    try {
      const copy = await request<Task>("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: task.title,
          description: task.description,
          priority: task.priority,
          estimatedHours: task.estimatedHours,
        }),
      });
      setTasks((prev) => [copy, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to duplicate task");
    }
  }

  function startEdit(task: Task) {
    setEditingTaskId(task.taskId);
    setEditDescription(task.description ?? "");
    setEditDueDate(task.dueDate ?? "");
    setEditDueTime(task.dueTime ?? "");
    setEditEstimatedHours(task.estimatedHours !== undefined ? String(task.estimatedHours) : "");
    setEditSuggestPriority(false);
  }

  async function saveEdit(taskId: string) {
    setSavingEdit(true);
    await updateTask(taskId, {
      description: editDescription.trim(),
      dueDate: editDueDate || undefined,
      dueTime: editDueTime || undefined,
      dueAtUtc: computeDueAtUtc(editDueDate, editDueTime),
      estimatedHours: editEstimatedHours ? Number(editEstimatedHours) : undefined,
      suggestPriority: editSuggestPriority || undefined,
    });
    setSavingEdit(false);
    setEditingTaskId(null);
  }

  const selectClass =
    "rounded-xl border border-stone bg-paper-card px-2 py-1 text-xs text-ink focus:border-bloom focus:outline-none dark:border-stone-dark dark:bg-ink-bg-card dark:text-paper";

  const filteredTasks = search.trim()
    ? tasks.filter((t) => t.title.toLowerCase().includes(search.trim().toLowerCase()))
    : tasks;

  const today = todayLocal();
  const groupedTasks: Record<TaskGroup, Task[]> = {
    Overdue: [],
    Today: [],
    Upcoming: [],
    "No due date": [],
    Done: [],
  };
  for (const task of filteredTasks) {
    groupedTasks[taskGroup(task, today)].push(task);
  }
  for (const group of GROUP_ORDER) {
    if (group === "No due date") continue;
    groupedTasks[group].sort((a, b) => {
      const aKey = `${a.dueDate ?? ""}${a.dueTime ?? ""}`;
      const bKey = `${b.dueDate ?? ""}${b.dueTime ?? ""}`;
      return aKey.localeCompare(bKey);
    });
  }

  return (
    <div className={page}>
      <h1 className={pageTitle}>Tasks</h1>

      <form onSubmit={handleCreate} className={`mb-8 flex flex-wrap items-end gap-3 ${card}`}>
        <div className="min-w-[200px] flex-1">
          <div className="mb-1 flex items-center justify-between">
            <label className={label}>Title</label>
            {voiceSupported && (
              <button
                type="button"
                onClick={handleToggleVoice}
                className={`${pillButton} ${
                  listening
                    ? "border-alert bg-alert text-paper-card"
                    : pillButtonInactive
                }`}
              >
                {listening ? "⏹️ Stop" : "🎤 Voice input"}
              </button>
            )}
          </div>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={`w-full ${input}`}
          />
          {voiceError && <p className={`mt-1 text-xs ${errorText}`}>{voiceError}</p>}
        </div>
        <div className="min-w-[200px] flex-1">
          <div className="mb-1 flex items-center justify-between">
            <label className={label}>Description (optional)</label>
            {descriptionVoiceSupported && (
              <button
                type="button"
                onClick={handleToggleDescriptionVoice}
                className={`${pillButton} ${
                  descriptionListening
                    ? "border-alert bg-alert text-paper-card"
                    : pillButtonInactive
                }`}
              >
                {descriptionListening ? "⏹️ Stop" : "🎤 Voice input"}
              </button>
            )}
          </div>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Notes, links, anything you'll want later"
            className={`w-full ${input}`}
          />
          {descriptionVoiceError && (
            <p className={`mt-1 text-xs ${errorText}`}>{descriptionVoiceError}</p>
          )}
        </div>
        <div>
          <label className={label}>Due date</label>
          <input
            type="date"
            required
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={input}
          />
          <div className="mt-1.5 flex gap-1.5">
            {DATE_PRESETS.map((preset) => {
              const presetDate = dateOffsetDays(preset.days);
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setDueDate(presetDate)}
                  className={`${pillButton} ${
                    dueDate === presetDate ? "border-bloom bg-bloom text-paper-card" : pillButtonInactive
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className={label}>Est. hours</label>
          <input
            type="number"
            min={0}
            step="0.5"
            value={estimatedHours}
            onChange={(e) => setEstimatedHours(e.target.value)}
            className={`w-20 ${input}`}
          />
        </div>
        <div>
          <label className={label}>Priority</label>
          <select
            value={priority}
            disabled={suggestPriority}
            onChange={(e) => {
              setPriority(e.target.value as TaskPriority);
              setSuggestPriority(false);
            }}
            className={`${input} disabled:opacity-50`}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <label className={`flex items-center gap-1.5 pb-2 ${label}`}>
          <input
            type="checkbox"
            checked={suggestPriority}
            onChange={(e) => setSuggestPriority(e.target.checked)}
            className="rounded border-stone text-bloom focus:ring-bloom dark:border-stone-dark"
          />
          Suggest with AI
        </label>

        <button
          type="button"
          onClick={() => setShowMoreOptions((v) => !v)}
          className="w-full pb-1 text-left text-xs font-medium text-bloom hover:underline"
        >
          {showMoreOptions ? "Fewer options ▴" : "Due time, schedule time ▾"}
        </button>

        {showMoreOptions && (
          <>
            <div>
              <label className={label}>Due time</label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className={input}
              />
            </div>
            <div>
              <label className={label}>Schedule time</label>
              <input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className={input}
              />
            </div>
          </>
        )}

        <button type="submit" disabled={creating} className={primaryButton}>
          {creating ? "Adding..." : "➕ Add task"}
        </button>
      </form>

      {error && <p className={`mb-4 ${errorText}`}>{error}</p>}

      {tasks.length > 0 && (
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks..."
          aria-label="Search tasks"
          className={`mb-4 w-full ${input}`}
        />
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-2xl" />
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState icon="✅" title="No tasks yet" hint="Add your first task above to get started." />
      ) : filteredTasks.length === 0 ? (
        <p className={mutedText}>No tasks match "{search}". 🔍</p>
      ) : (
        <div className="flex flex-col gap-6">
          {GROUP_ORDER.filter((g) => groupedTasks[g].length > 0).map((group) => (
            <div key={group}>
              <p className={`mb-2 ${sectionLabel}`}>
                {GROUP_EMOJI[group]} {group}{" "}
                <span className="normal-case text-mist-muted">({groupedTasks[group].length})</span>
              </p>
              <ul className="flex flex-col gap-3">
                {groupedTasks[group].map((task) => (
                  <TaskCard
                    key={task.taskId}
                    task={task}
                    isEditing={editingTaskId === task.taskId}
                    onToggleEdit={() =>
                      editingTaskId === task.taskId ? setEditingTaskId(null) : startEdit(task)
                    }
                    onUpdate={(patch) => updateTask(task.taskId, patch)}
                    onDuplicate={() => duplicateTask(task)}
                    editDescription={editDescription}
                    setEditDescription={setEditDescription}
                    editDueDate={editDueDate}
                    setEditDueDate={setEditDueDate}
                    editDueTime={editDueTime}
                    setEditDueTime={setEditDueTime}
                    editEstimatedHours={editEstimatedHours}
                    setEditEstimatedHours={setEditEstimatedHours}
                    editSuggestPriority={editSuggestPriority}
                    setEditSuggestPriority={setEditSuggestPriority}
                    savingEdit={savingEdit}
                    onSaveEdit={() => saveEdit(task.taskId)}
                    selectClass={selectClass}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
