import { useEffect, useRef, useState, type FormEvent } from "react";
import { useApi } from "../api/useApi";
import { useSpeechToText } from "../hooks/useSpeechToText";
import type { Task, TaskPriority, TaskStatus } from "../types";

const PRIORITIES: TaskPriority[] = ["Low", "Medium", "High"];
const STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  Low: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  Medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  High: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

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

  return (
    <div className="mx-auto mt-8 w-full max-w-2xl px-4">
      <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">Tasks</h1>

      <form
        onSubmit={handleCreate}
        className="mb-8 flex flex-wrap items-end gap-3 rounded-md border border-gray-200 p-4 dark:border-gray-700"
      >
        <div className="min-w-[200px] flex-1">
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              Title
            </label>
            {voiceSupported && (
              <button
                type="button"
                onClick={handleToggleVoice}
                className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                  listening
                    ? "border-red-600 bg-red-600 text-white"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
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
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
          {voiceError && <p className="mt-1 text-xs text-red-600">{voiceError}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            Due date
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            Due time
          </label>
          <input
            type="time"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            Est. hours
          </label>
          <input
            type="number"
            min={0}
            step="0.5"
            value={estimatedHours}
            onChange={(e) => setEstimatedHours(e.target.value)}
            className="w-20 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            Schedule time
          </label>
          <input
            type="time"
            value={scheduleTime}
            onChange={(e) => setScheduleTime(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            Priority
          </label>
          <select
            value={priority}
            disabled={suggestPriority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-1.5 pb-1.5 text-xs font-medium text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={suggestPriority}
            onChange={(e) => setSuggestPriority(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Suggest with AI
        </label>
        <button
          type="submit"
          disabled={creating}
          className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {creating ? "Adding..." : "Add task"}
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading tasks...</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-gray-500">No tasks yet — add one above.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <li
              key={task.taskId}
              className="flex flex-col gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-700"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p
                    className={`font-medium text-gray-900 dark:text-gray-100 ${
                      task.status === "done" ? "line-through opacity-60" : ""
                    }`}
                  >
                    {task.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {task.dueDate ?? "No due date"}
                    {task.dueTime ? ` ${task.dueTime}` : ""}
                    {task.estimatedHours !== undefined ? ` · ~${task.estimatedHours}h` : ""}
                    {task.scheduleTime ? ` · scheduled ${task.scheduleTime}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE[task.priority]}`}
                    title={`Priority source: ${task.prioritySource}`}
                  >
                    {task.priority}
                  </span>
                  {task.prioritySource === "ai" && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                      AI
                    </span>
                  )}
                  <select
                    value={task.priority}
                    onChange={(e) =>
                      updateTask(task.taskId, { priority: e.target.value as TaskPriority })
                    }
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
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
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
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
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
                  >
                    {editingTaskId === task.taskId ? "Cancel" : "Edit"}
                  </button>
                </div>
              </div>

              {editingTaskId === task.taskId && (
                <div className="flex flex-wrap items-end gap-3 border-t border-gray-100 pt-3 dark:border-gray-800">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Due date
                    </label>
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Due time
                    </label>
                    <input
                      type="time"
                      value={editDueTime}
                      onChange={(e) => setEditDueTime(e.target.value)}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Est. hours
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={editEstimatedHours}
                      onChange={(e) => setEditEstimatedHours(e.target.value)}
                      className="w-20 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                  <label className="flex items-center gap-1.5 pb-1.5 text-xs font-medium text-gray-600 dark:text-gray-400">
                    <input
                      type="checkbox"
                      checked={editSuggestPriority}
                      onChange={(e) => setEditSuggestPriority(e.target.checked)}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                    Re-suggest priority with AI
                  </label>
                  <button
                    type="button"
                    disabled={savingEdit}
                    onClick={() => saveEdit(task.taskId)}
                    className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
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
