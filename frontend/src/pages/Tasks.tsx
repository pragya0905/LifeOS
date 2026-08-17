import { useEffect, useRef, useState, type FormEvent } from "react";
import { useApi } from "../api/useApi";
import { useSpeechToText } from "../hooks/useSpeechToText";
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
} from "../components/ui";

const PRIORITIES: TaskPriority[] = ["Low", "Medium", "High"];
const STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];

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

  const forced = remaining <= task.estimatedHours;
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
          className="absolute inset-y-0 left-0 rounded-full bg-sage/50"
          style={{ width: `${triggerPct}%` }}
        />
        <div
          className="absolute -top-[3px] h-3 w-0.5 rounded-sm bg-[#C79233]"
          style={{ left: `${triggerPct}%` }}
          title="Priority forced High from here"
        />
        <div
          className="absolute -top-[3px] right-0 h-3 w-0.5 rounded-sm bg-terracotta"
          title="Due"
        />
      </div>
      <div className="flex justify-between text-[10px] uppercase tracking-[0.1em] text-fog-muted">
        <span>Now</span>
        <span>Due {dueLabel}</span>
      </div>
      {forced && (
        <p className="mt-1 rounded-lg border border-[#E3C878]/50 bg-[#F0E4C8]/40 px-2.5 py-1.5 text-xs text-[#8A6A22] dark:border-[#4A3D1E] dark:bg-[#4A3D1E]/40 dark:text-[#E3C878]">
          Forced to High — {task.estimatedHours}h of work no longer fits before {dueLabel}
        </p>
      )}
    </div>
  );
}

export default function Tasks() {
  const { request } = useApi();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [scheduleTime, setScheduleTime] = useState("");
  const [suggestPriority, setSuggestPriority] = useState(false);
  const [creating, setCreating] = useState(false);
  const [usedVoice, setUsedVoice] = useState(false);

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editDueDate, setEditDueDate] = useState("");
  const [editDueTime, setEditDueTime] = useState("");
  const [editEstimatedHours, setEditEstimatedHours] = useState("");
  const [editSuggestPriority, setEditSuggestPriority] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const baseTitleRef = useRef("");
  const finalTranscriptRef = useRef("");

  const {
    supported: voiceSupported,
    listening,
    error: voiceError,
    start: startListening,
    stop: stopListening,
  } = useSpeechToText((transcript, isFinal) => {
    if (isFinal) {
      finalTranscriptRef.current = joinText(finalTranscriptRef.current, transcript.trim());
      setTitle(joinText(baseTitleRef.current, finalTranscriptRef.current));
      setUsedVoice(true);
    } else {
      setTitle(joinText(baseTitleRef.current, joinText(finalTranscriptRef.current, transcript.trim())));
    }
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
    finalTranscriptRef.current = "";
    startListening();
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (listening) stopListening();
    setCreating(true);
    setError(null);
    try {
      const task = await request<Task>("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          dueDate: dueDate || undefined,
          dueTime: dueTime || undefined,
          estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
          voiceInput: usedVoice,
          priority,
          scheduleTime: scheduleTime || undefined,
          suggestPriority: suggestPriority || undefined,
        }),
      });
      setTasks((prev) => [task, ...prev]);
      setTitle("");
      setDueDate("");
      setDueTime("");
      setEstimatedHours("");
      setScheduleTime("");
      setPriority("Medium");
      setSuggestPriority(false);
      setUsedVoice(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setCreating(false);
    }
  }

  async function updateTask(taskId: string, patch: Record<string, unknown>) {
    setError(null);
    try {
      const updated = await request<Task>(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setTasks((prev) => prev.map((t) => (t.taskId === taskId ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update task");
    }
  }

  async function duplicateTask(task: Task) {
    setError(null);
    try {
      const copy = await request<Task>("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: task.title,
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
    setEditDueDate(task.dueDate ?? "");
    setEditDueTime(task.dueTime ?? "");
    setEditEstimatedHours(task.estimatedHours !== undefined ? String(task.estimatedHours) : "");
    setEditSuggestPriority(false);
  }

  async function saveEdit(taskId: string) {
    setSavingEdit(true);
    await updateTask(taskId, {
      dueDate: editDueDate || undefined,
      dueTime: editDueTime || undefined,
      estimatedHours: editEstimatedHours ? Number(editEstimatedHours) : undefined,
      suggestPriority: editSuggestPriority || undefined,
    });
    setSavingEdit(false);
    setEditingTaskId(null);
  }

  const selectClass =
    "rounded-xl border border-stone bg-cream-card px-2 py-1 text-xs text-ink focus:border-sage focus:outline-none dark:border-stone-dark dark:bg-charcoal-card dark:text-cream";

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
                    ? "border-terracotta bg-terracotta text-cream-card"
                    : pillButtonInactive
                }`}
              >
                {listening ? "Stop" : "Voice input"}
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
        <div>
          <label className={label}>Due date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={input}
          />
        </div>
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
          <label className={label}>Schedule time</label>
          <input
            type="time"
            value={scheduleTime}
            onChange={(e) => setScheduleTime(e.target.value)}
            className={input}
          />
        </div>
        <div>
          <label className={label}>Priority</label>
          <select
            value={priority}
            disabled={suggestPriority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
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
            className="rounded border-stone text-sage focus:ring-sage dark:border-stone-dark"
          />
          Suggest with AI
        </label>
        <button type="submit" disabled={creating} className={primaryButton}>
          {creating ? "Adding..." : "Add task"}
        </button>
      </form>

      {error && <p className={`mb-4 ${errorText}`}>{error}</p>}

      {loading ? (
        <p className={mutedText}>Loading tasks...</p>
      ) : tasks.length === 0 ? (
        <p className={mutedText}>No tasks yet — add one above.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tasks.map((task) => (
            <li key={task.taskId} className={`flex flex-col gap-3 ${card}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p
                    className={`font-medium text-ink dark:text-cream ${
                      task.status === "done" ? "line-through opacity-60" : ""
                    }`}
                  >
                    {task.title}
                  </p>
                  <p className="text-xs text-ink-muted dark:text-fog-muted">
                    {task.dueDate ?? "No due date"}
                    {task.dueTime ? ` ${task.dueTime}` : ""}
                    {task.estimatedHours !== undefined ? ` · ~${task.estimatedHours}h` : ""}
                    {task.scheduleTime ? ` · scheduled ${task.scheduleTime}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityBadgeClass[task.priority]}`}
                    title={`Priority source: ${task.prioritySource}`}
                  >
                    {task.priority}
                  </span>
                  {task.prioritySource === "ai" && <span className={badge}>AI</span>}
                  <select
                    value={task.priority}
                    onChange={(e) =>
                      updateTask(task.taskId, { priority: e.target.value as TaskPriority })
                    }
                    className={selectClass}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <select
                    value={task.status}
                    onChange={(e) =>
                      updateTask(task.taskId, { status: e.target.value as TaskStatus })
                    }
                    className={selectClass}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      editingTaskId === task.taskId ? setEditingTaskId(null) : startEdit(task)
                    }
                    className={`${secondaryButton} px-2 py-1 text-xs`}
                  >
                    {editingTaskId === task.taskId ? "Cancel" : "Edit"}
                  </button>
                  <button
                    type="button"
                    onClick={() => duplicateTask(task)}
                    title="Create a new task with the same title, priority, and estimate"
                    className={`${secondaryButton} px-2 py-1 text-xs`}
                  >
                    Duplicate
                  </button>
                </div>
              </div>

              <TaskTimeline task={task} />

              {editingTaskId === task.taskId && (
                <div className="flex flex-wrap items-end gap-3 border-t border-stone/60 pt-3 dark:border-stone-dark/60">
                  <div>
                    <label className={label}>Due date</label>
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className={input}
                    />
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
                      className="rounded border-stone text-sage focus:ring-sage dark:border-stone-dark"
                    />
                    Re-suggest priority with AI
                  </label>
                  <button
                    type="button"
                    disabled={savingEdit}
                    onClick={() => saveEdit(task.taskId)}
                    className={primaryButton}
                  >
                    {savingEdit ? "Saving..." : "Save"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
