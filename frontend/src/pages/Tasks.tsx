import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Clock, Copy, Pencil, Repeat, Trash2 } from "lucide-react";
import { useApi } from "../api/useApi";
import { useSpeechToText } from "../hooks/useSpeechToText";
import { useToast } from "../components/Toast";
import { computeDueAtUtc, formatDueTime, TASK_TIME_PRESETS, todayLocal, toLocalDateStr } from "../lib/date";
import { ALL_DAYS, formatSchedule } from "../lib/weekdays";
import { Icon } from "../components/Icon";
import { Chip } from "../components/Chip";
import { Skeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import DayOfWeekPicker from "../components/DayOfWeekPicker";
import type { RecurrenceFrequency, Task, TaskPriority, TaskRecurrence, TaskStatus } from "../types";
import {
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
  secondaryButton,
  sectionLabel,
} from "../components/ui";

const PRIORITIES: TaskPriority[] = ["Low", "Medium", "High"];
const STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

// Priority is always a color + a label, never color alone — High=red, Medium=amber, Low=green.
const PRIORITY_CLASS: Record<TaskPriority, string> = {
  High: "border-alert bg-alert-soft text-alert dark:bg-alert-soft-dark dark:text-alert-light",
  Medium: "border-amber bg-amber-soft text-amber-ink dark:bg-amber-soft-dark dark:text-amber-ink-dark",
  Low: "border-success bg-success-soft text-success-ink dark:bg-success-soft-dark dark:text-success-ink-dark",
};

const STATUS_BUTTON_CLASS: Record<TaskStatus, string> = {
  todo: "border-stone text-ink-muted dark:border-stone-dark dark:text-mist-muted",
  in_progress: "border-amber bg-amber-soft text-amber-ink dark:bg-amber-soft-dark dark:text-amber-ink-dark",
  done: "border-success bg-success text-paper-card",
};

const PRIORITY_SOURCE_LABEL: Record<Task["prioritySource"], string> = {
  manual: "Manual",
  ai: "AI suggested",
  auto: "Auto-escalated",
};

const RECURRENCE_FREQUENCY_LABEL: Record<RecurrenceFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  every_n_days: "Every N days",
  monthly: "Monthly",
};

const SUGGESTED_CATEGORIES = ["Work", "Personal", "Health", "Errands"];

function formatRecurrence(recurrence: TaskRecurrence | undefined): string | null {
  if (!recurrence) return null;
  switch (recurrence.frequency) {
    case "daily":
      return "Daily";
    case "weekly":
      return formatSchedule(recurrence.daysOfWeek);
    case "every_n_days":
      return `Every ${recurrence.intervalDays} day${recurrence.intervalDays === 1 ? "" : "s"}`;
    case "monthly":
      return `Monthly (${recurrence.dayOfMonth}${ordinalSuffix(recurrence.dayOfMonth ?? 1)})`;
  }
}

function ordinalSuffix(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return "st";
  if (n % 10 === 2 && n % 100 !== 12) return "nd";
  if (n % 10 === 3 && n % 100 !== 13) return "rd";
  return "th";
}

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
  const staleForced = forced && task.priority !== "High";
  const dueLabel = task.dueTime ? `${task.dueDate} ${formatDueTime(task.dueTime)}` : task.dueDate;

  const windowHours = Math.max(remaining, 1);
  const triggerHoursFromNow = remaining - task.estimatedHours;
  const triggerPct = Math.min(Math.max((triggerHoursFromNow / windowHours) * 100, 0), 100);

  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-1.5 overflow-visible rounded-full bg-stone dark:bg-stone-dark">
        <div className="absolute inset-y-0 left-0 rounded-full bg-bloom/50" style={{ width: `${triggerPct}%` }} />
        <div className="absolute -top-[3px] h-3 w-0.5 rounded-sm bg-amber" style={{ left: `${triggerPct}%` }} title="Priority forced High from here" />
        <div className="absolute -top-[3px] right-0 h-3 w-0.5 rounded-sm bg-alert" title="Due" />
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
          {task.priority}, but will escalate to High automatically within a few minutes.
        </p>
      )}
    </div>
  );
}

// Always-visible, labeled status buttons (per DESIGN.md: never a hidden/cycling single
// control) — jumping directly to any of the three states is one tap, including "Done" from
// any starting state.
function TaskStatusButtons({ status, onSetStatus }: { status: TaskStatus; onSetStatus: (status: TaskStatus) => void }) {
  return (
    <div className="flex gap-1.5">
      {STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onSetStatus(s)}
          aria-pressed={status === s}
          className={`flex min-h-10 items-center justify-center gap-1.5 rounded-control border px-3 text-xs font-medium transition-colors ${
            status === s ? STATUS_BUTTON_CLASS[s] : "border-stone text-ink-muted hover:bg-stone/40 dark:border-stone-dark dark:text-mist-muted dark:hover:bg-stone-dark/40"
          }`}
        >
          {s === "done" && <Icon icon={Check} size={13} strokeWidth={2.4} />}
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

// Small ring showing how much of the remaining time-before-due the estimated effort would
// consume — a HIGH fraction means urgent (red), not "closer to a goal" the way a progress
// ring normally reads, since this is measuring how little slack is left, not how much is done.
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
  const colorClass = fraction >= 0.67 ? "stroke-alert" : fraction >= 0.34 ? "stroke-amber" : "stroke-success";

  return (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }} title={remaining <= 0 ? "Overdue" : `${remaining.toFixed(1)}h remaining until due`}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Time until due">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={STROKE} className="stroke-stone dark:stroke-stone-dark" />
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

// Shared by the add-task form and TaskCard's inline edit form. Module-level so React keeps
// element identity across re-renders.
function RecurrenceEditor({ value, onChange }: { value: TaskRecurrence | undefined; onChange: (v: TaskRecurrence | undefined) => void }) {
  const frequency = value?.frequency;
  const daysOfWeek = value?.daysOfWeek && value.daysOfWeek.length > 0 ? value.daysOfWeek : ALL_DAYS;

  return (
    <div>
      <label className={label}>Repeats (optional)</label>
      <select
        value={frequency ?? ""}
        onChange={(e) => {
          const next = e.target.value as RecurrenceFrequency | "";
          if (!next) onChange(undefined);
          else if (next === "weekly") onChange({ frequency: "weekly", daysOfWeek: value?.daysOfWeek ?? [] });
          else if (next === "every_n_days") onChange({ frequency: "every_n_days", intervalDays: value?.intervalDays ?? 1 });
          else if (next === "monthly") onChange({ frequency: "monthly", dayOfMonth: value?.dayOfMonth ?? 1 });
          else onChange({ frequency: "daily" });
        }}
        className={input}
      >
        <option value="">Does not repeat</option>
        {(Object.keys(RECURRENCE_FREQUENCY_LABEL) as RecurrenceFrequency[]).map((f) => (
          <option key={f} value={f}>
            {RECURRENCE_FREQUENCY_LABEL[f]}
          </option>
        ))}
      </select>
      {frequency === "weekly" && (
        <div className="mt-1.5">
          <DayOfWeekPicker
            selected={daysOfWeek}
            onToggle={(day) => {
              const next = daysOfWeek.includes(day) ? daysOfWeek.filter((d) => d !== day) : [...daysOfWeek, day].sort();
              onChange({ frequency: "weekly", daysOfWeek: next.length === 7 ? [] : next });
            }}
          />
        </div>
      )}
      {frequency === "every_n_days" && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className={mutedText}>Every</span>
          <input
            type="number"
            min={1}
            value={value?.intervalDays ?? 1}
            onChange={(e) => onChange({ frequency: "every_n_days", intervalDays: Math.max(1, Number(e.target.value) || 1) })}
            className={`w-16 ${input}`}
          />
          <span className={mutedText}>days</span>
        </div>
      )}
      {frequency === "monthly" && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className={mutedText}>Day</span>
          <input
            type="number"
            min={1}
            max={31}
            value={value?.dayOfMonth ?? 1}
            onChange={(e) => onChange({ frequency: "monthly", dayOfMonth: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })}
            className={`w-16 ${input}`}
          />
          <span className={mutedText}>of the month</span>
        </div>
      )}
    </div>
  );
}

function CategoryEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className={label}>Category (optional)</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Work, Health, ..." maxLength={40} className={`w-36 ${input}`} />
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {SUGGESTED_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(value === c ? "" : c)}
            className={`${pillButton} ${value === c ? "border-bloom bg-bloom text-paper-card" : pillButtonInactive}`}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

// A compact inline control for the one field people change most often without opening the
// full edit form — tap "Edit time", pick a preset or type one, Save/Cancel right there.
function QuickTimeEditor({ initial, onSave, onCancel }: { initial: string; onSave: (time: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-control border border-stone p-2.5 dark:border-stone-dark">
      <div className="flex flex-wrap gap-1.5">
        {TASK_TIME_PRESETS.map((preset) => (
          <Chip key={preset.label} active={value === preset.time} onClick={() => setValue(preset.time)}>
            {preset.label}
          </Chip>
        ))}
      </div>
      <input type="time" value={value} onChange={(e) => setValue(e.target.value)} className={input} />
      <button type="button" onClick={() => onSave(value)} className={`${secondaryButton} px-3 py-1.5 text-xs`}>
        Save
      </button>
      <button type="button" onClick={onCancel} className={`${secondaryButton} px-3 py-1.5 text-xs`}>
        Cancel
      </button>
    </div>
  );
}


const TASK_REMINDER_LEAD_OPTIONS = [0, 5, 10, 15, 30];

// Module-level (not nested in Tasks) so React doesn't remount it on every parent re-render.
function TaskCard({
  task,
  isEditing,
  isQuickEditingTime,
  onToggleEdit,
  onToggleQuickEditTime,
  onUpdate,
  onDuplicate,
  onDelete,
  editDescription,
  setEditDescription,
  editDueDate,
  setEditDueDate,
  editDueTime,
  setEditDueTime,
  editReminderLead,
  setEditReminderLead,
  editEstimatedHours,
  setEditEstimatedHours,
  editCategory,
  setEditCategory,
  editSuggestPriority,
  setEditSuggestPriority,
  editRecurrence,
  setEditRecurrence,
  savingEdit,
  onSaveEdit,
  selectClass,
}: {
  task: Task;
  isEditing: boolean;
  isQuickEditingTime: boolean;
  onToggleEdit: () => void;
  onToggleQuickEditTime: () => void;
  onUpdate: (patch: Record<string, unknown>) => Promise<boolean>;
  onDuplicate: () => void;
  onDelete: () => void;
  editDescription: string;
  setEditDescription: (v: string) => void;
  editDueDate: string;
  setEditDueDate: (v: string) => void;
  editDueTime: string;
  setEditDueTime: (v: string) => void;
  editReminderLead: number;
  setEditReminderLead: (v: number) => void;
  editEstimatedHours: string;
  setEditEstimatedHours: (v: string) => void;
  editCategory: string;
  setEditCategory: (v: string) => void;
  editSuggestPriority: boolean;
  setEditSuggestPriority: (v: boolean) => void;
  editRecurrence: TaskRecurrence | undefined;
  setEditRecurrence: (v: TaskRecurrence | undefined) => void;
  savingEdit: boolean;
  onSaveEdit: () => void;
  selectClass: string;
}) {
  const recurrenceLabel = formatRecurrence(task.recurrence);

  return (
    <li className={`flex flex-col gap-3 border-l-4 ${PRIORITY_CLASS[task.priority].split(" ")[0]} ${card}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <DeadlineRing task={task} />
          <div className="min-w-0">
            <p className={`font-medium text-ink dark:text-paper ${task.status === "done" ? "line-through opacity-60" : ""}`} style={{ overflowWrap: "anywhere" }}>
              {task.title}
            </p>
            {task.description && (
              <p className="mt-0.5 text-sm text-ink-muted dark:text-mist-muted" style={{ overflowWrap: "anywhere" }}>
                {task.description}
              </p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-ink-muted dark:text-mist-muted">
              <span className={task.dueDate ? "font-medium text-ink dark:text-paper" : ""}>
                {task.dueDate ?? "No due date"}
                {task.dueTime ? ` · ${formatDueTime(task.dueTime)}` : ""}
              </span>
              {task.estimatedHours !== undefined && <span>~{task.estimatedHours}h</span>}
              {task.category && <span className={badgeFlat}>{task.category}</span>}
              {recurrenceLabel && (
                <span className="inline-flex items-center gap-1">
                  <Icon icon={Repeat} size={11} />
                  {recurrenceLabel}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-control border px-2 py-1 text-xs font-medium ${PRIORITY_CLASS[task.priority]}`}>
          {task.priority}
        </span>
        <span className="text-xs text-ink-muted dark:text-mist-muted">{PRIORITY_SOURCE_LABEL[task.prioritySource]}</span>
        <select value={task.priority} onChange={(e) => onUpdate({ priority: e.target.value as TaskPriority })} className={selectClass} aria-label="Edit priority">
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <TaskStatusButtons status={task.status} onSetStatus={(status) => onUpdate({ status })} />

      {isQuickEditingTime && (
        <QuickTimeEditor
          initial={task.dueTime ?? ""}
          onSave={(time) => {
            void onUpdate({ dueTime: time, dueAtUtc: task.dueDate ? computeDueAtUtc(task.dueDate, time) : undefined });
            onToggleQuickEditTime();
          }}
          onCancel={onToggleQuickEditTime}
        />
      )}

      <TaskTimeline task={task} />

      <div className="flex flex-wrap items-center gap-2 border-t border-stone/60 pt-3 dark:border-stone-dark/60">
        <button type="button" onClick={onToggleQuickEditTime} className={`${secondaryButton} flex min-h-10 items-center gap-1.5 px-3 text-xs`}>
          <Icon icon={Clock} size={13} />
          Edit time
        </button>
        <button type="button" onClick={onToggleEdit} className={`${secondaryButton} flex min-h-10 items-center gap-1.5 px-3 text-xs`}>
          <Icon icon={Pencil} size={13} />
          {isEditing ? "Cancel edit" : "Edit"}
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          title="Create a new task with the same title, priority, and estimate"
          className={`${secondaryButton} flex min-h-10 items-center gap-1.5 px-3 text-xs`}
        >
          <Icon icon={Copy} size={13} />
          Duplicate
        </button>
        <button type="button" onClick={onDelete} className={`${secondaryButton} flex min-h-10 items-center gap-1.5 px-3 text-xs`}>
          <Icon icon={Trash2} size={13} />
          Delete
        </button>
      </div>

      {isEditing && (
        <div className="flex flex-wrap items-end gap-3 border-t border-stone/60 pt-3 dark:border-stone-dark/60">
          <div className="min-w-[200px] flex-1">
            <label className={label}>Description (optional)</label>
            <input type="text" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Notes, links, anything you'll want later" className={`w-full ${input}`} />
          </div>
          <div>
            <label className={label}>Due date</label>
            <input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} className={input} />
            <div className="mt-1.5 flex gap-1.5">
              {DATE_PRESETS.map((preset) => {
                const presetDate = dateOffsetDays(preset.days);
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setEditDueDate(presetDate)}
                    className={`${pillButton} ${editDueDate === presetDate ? "border-bloom bg-bloom text-paper-card" : pillButtonInactive}`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className={label}>Due time</label>
            <input type="time" value={editDueTime} onChange={(e) => setEditDueTime(e.target.value)} className={input} />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {TASK_TIME_PRESETS.map((preset) => (
                <Chip key={preset.label} active={editDueTime === preset.time} onClick={() => setEditDueTime(preset.time)}>
                  {preset.label}
                </Chip>
              ))}
            </div>
          </div>
          {editDueTime && (
            <div>
              <label className={label}>Remind me</label>
              <select value={editReminderLead} onChange={(e) => setEditReminderLead(Number(e.target.value))} className={selectClass}>
                {TASK_REMINDER_LEAD_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? "At due time" : `${m} min before`}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={label}>Est. hours</label>
            <input type="number" min={0} step="0.5" value={editEstimatedHours} onChange={(e) => setEditEstimatedHours(e.target.value)} className={`w-20 ${input}`} />
          </div>
          <CategoryEditor value={editCategory} onChange={setEditCategory} />
          <RecurrenceEditor value={editRecurrence} onChange={setEditRecurrence} />
          <label className={`flex items-center gap-1.5 pb-2 ${label}`}>
            <input
              type="checkbox"
              checked={editSuggestPriority}
              onChange={(e) => setEditSuggestPriority(e.target.checked)}
              className="h-4 w-4 rounded border-stone accent-bloom focus:ring-bloom dark:border-stone-dark"
            />
            Re-suggest priority with AI
          </label>
          <button type="button" disabled={savingEdit} onClick={onSaveEdit} className={primaryButton}>
            {savingEdit ? "Saving..." : "Save"}
          </button>
        </div>
      )}
    </li>
  );
}

const badgeFlat = "rounded-full bg-stone px-2 py-0.5 text-[11px] font-medium text-ink-muted dark:bg-stone-dark dark:text-mist-muted";

type TaskGroup = "Overdue" | "Due today" | "Upcoming" | "Anytime" | "Done";
const GROUP_ORDER: TaskGroup[] = ["Overdue", "Due today", "Upcoming", "Anytime", "Done"];

function taskGroup(task: Task, today: string): TaskGroup {
  if (task.status === "done") return "Done";
  if (!task.dueDate) return "Anytime";
  if (task.dueDate < today) return "Overdue";
  if (task.dueDate === today) return "Due today";
  return "Upcoming";
}

export default function Tasks() {
  const { request } = useApi();
  const { show: showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // Pre-filled when arriving from the Calendar page's "Add task for this day" link.
  const [dueDate, setDueDate] = useState(() => searchParams.get("date") ?? "");
  const [dueTime, setDueTime] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [reminderLead, setReminderLead] = useState(0);
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [scheduleTime, setScheduleTime] = useState("");
  const [recurrence, setRecurrence] = useState<TaskRecurrence | undefined>(undefined);
  const [suggestPriority, setSuggestPriority] = useState(true);
  const [creating, setCreating] = useState(false);
  const [usedVoice, setUsedVoice] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [quickEditTimeTaskId, setQuickEditTimeTaskId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editDueTime, setEditDueTime] = useState("");
  const [editEstimatedHours, setEditEstimatedHours] = useState("");
  const [editReminderLead, setEditReminderLead] = useState(0);
  const [editCategory, setEditCategory] = useState("");
  const [editSuggestPriority, setEditSuggestPriority] = useState(false);
  const [editRecurrence, setEditRecurrence] = useState<TaskRecurrence | undefined>(undefined);
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
          ...(dueTime ? { reminderLeadMinutes: reminderLead } : {}),
          category: category.trim() || undefined,
          voiceInput: usedVoice,
          priority,
          scheduleTime: scheduleTime || undefined,
          recurrence,
          suggestPriority: suggestPriority || undefined,
        }),
      });
      setTasks((prev) => [task, ...prev]);
      setTitle("");
      setDescription("");
      setDueDate("");
      setDueTime("");
      setEstimatedHours("");
      setReminderLead(0);
      setCategory("");
      setScheduleTime("");
      setPriority("Medium");
      setRecurrence(undefined);
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
      const updated = await request<Task>(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(patch) });
      setTasks((prev) => prev.map((t) => (t.taskId === taskId ? updated : t)));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update task");
      return false;
    }
  }

  async function deleteTask(task: Task) {
    setError(null);
    const snapshot = task;
    setTasks((prev) => prev.filter((t) => t.taskId !== task.taskId));
    try {
      await request(`/tasks/${task.taskId}`, { method: "DELETE" });
    } catch (err) {
      setTasks((prev) => [snapshot, ...prev]);
      setError(err instanceof Error ? err.message : "Failed to delete task");
      return;
    }
    showToast(`"${task.title}" deleted`, {
      undo: () => {
        request<Task>("/tasks", {
          method: "POST",
          body: JSON.stringify({
            title: snapshot.title,
            description: snapshot.description,
            dueDate: snapshot.dueDate,
            dueTime: snapshot.dueTime,
            dueAtUtc: snapshot.dueAtUtc,
            estimatedHours: snapshot.estimatedHours,
            category: snapshot.category,
            priority: snapshot.priority,
            scheduleTime: snapshot.scheduleTime,
            recurrence: snapshot.recurrence,
          }),
        })
          .then((restored) => setTasks((prev) => [restored, ...prev]))
          .catch(() => {});
      },
    });
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
          category: task.category,
        }),
      });
      setTasks((prev) => [copy, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to duplicate task");
    }
  }

  function startEdit(task: Task) {
    setEditingTaskId(task.taskId);
    setQuickEditTimeTaskId(null);
    setEditDescription(task.description ?? "");
    setEditDueDate(task.dueDate ?? "");
    setEditDueTime(task.dueTime ?? "");
    setEditEstimatedHours(task.estimatedHours !== undefined ? String(task.estimatedHours) : "");
    setEditReminderLead(task.reminderLeadMinutes ?? 0);
    setEditCategory(task.category ?? "");
    setEditSuggestPriority(false);
    setEditRecurrence(task.recurrence);
  }

  async function saveEdit(taskId: string) {
    setSavingEdit(true);
    await updateTask(taskId, {
      description: editDescription.trim(),
      dueDate: editDueDate || undefined,
      dueTime: editDueTime || undefined,
      dueAtUtc: computeDueAtUtc(editDueDate, editDueTime),
      estimatedHours: editEstimatedHours ? Number(editEstimatedHours) : undefined,
      ...(editDueTime ? { reminderLeadMinutes: editReminderLead } : {}),
      category: editCategory.trim(),
      recurrence: editRecurrence,
      suggestPriority: editSuggestPriority || undefined,
    });
    setSavingEdit(false);
    setEditingTaskId(null);
  }

  const selectClass =
    "rounded-xl border border-stone bg-paper-card px-2 py-1.5 text-xs text-ink focus:border-bloom focus:outline-none dark:border-stone-dark dark:bg-ink-bg-card dark:text-paper";

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) if (t.category) set.add(t.category);
    return Array.from(set).sort();
  }, [tasks]);

  const filteredTasks = tasks
    .filter((t) => !search.trim() || t.title.toLowerCase().includes(search.trim().toLowerCase()))
    .filter((t) => priorityFilter === "all" || t.priority === priorityFilter)
    .filter((t) => categoryFilter === "all" || t.category === categoryFilter);

  const today = todayLocal();
  const groupedTasks: Record<TaskGroup, Task[]> = { Overdue: [], "Due today": [], Upcoming: [], Anytime: [], Done: [] };
  for (const task of filteredTasks) {
    groupedTasks[taskGroup(task, today)].push(task);
  }
  for (const group of GROUP_ORDER) {
    if (group === "Anytime") continue;
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
              <button type="button" onClick={handleToggleVoice} className={`${pillButton} ${listening ? "border-alert bg-alert text-paper-card" : pillButtonInactive}`}>
                {listening ? "⏹️ Stop" : "🎤 Voice input"}
              </button>
            )}
          </div>
          <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className={`w-full ${input}`} />
          {voiceError && <p className={`mt-1 text-xs ${errorText}`}>{voiceError}</p>}
        </div>
        <div className="min-w-[200px] flex-1">
          <div className="mb-1 flex items-center justify-between">
            <label className={label}>Description (optional)</label>
            {descriptionVoiceSupported && (
              <button type="button" onClick={handleToggleDescriptionVoice} className={`${pillButton} ${descriptionListening ? "border-alert bg-alert text-paper-card" : pillButtonInactive}`}>
                {descriptionListening ? "⏹️ Stop" : "🎤 Voice input"}
              </button>
            )}
          </div>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notes, links, anything you'll want later" className={`w-full ${input}`} />
          {descriptionVoiceError && <p className={`mt-1 text-xs ${errorText}`}>{descriptionVoiceError}</p>}
        </div>
        <div>
          <label className={label}>Due date</label>
          <input type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={input} />
          <div className="mt-1.5 flex gap-1.5">
            {DATE_PRESETS.map((preset) => {
              const presetDate = dateOffsetDays(preset.days);
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setDueDate(presetDate)}
                  className={`${pillButton} ${dueDate === presetDate ? "border-bloom bg-bloom text-paper-card" : pillButtonInactive}`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className={label}>Due time</label>
          <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className={input} />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {TASK_TIME_PRESETS.map((preset) => (
              <Chip key={preset.label} active={dueTime === preset.time} onClick={() => setDueTime(preset.time)}>
                {preset.label}
              </Chip>
            ))}
          </div>
        </div>
        {dueTime && (
          <div>
            <label className={label}>Remind me</label>
            <select value={reminderLead} onChange={(e) => setReminderLead(Number(e.target.value))} className={selectClass}>
              {TASK_REMINDER_LEAD_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? "At due time" : `${m} min before`}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className={label}>Est. hours</label>
          <input type="number" min={0} step="0.5" value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} className={`w-20 ${input}`} />
        </div>
        <CategoryEditor value={category} onChange={setCategory} />
        <RecurrenceEditor value={recurrence} onChange={setRecurrence} />
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
            className="h-4 w-4 rounded border-stone accent-bloom focus:ring-bloom dark:border-stone-dark"
          />
          Suggest with AI
        </label>

        <button type="button" onClick={() => setShowMoreOptions((v) => !v)} className="w-full pb-1 text-left text-xs font-medium text-bloom hover:underline">
          {showMoreOptions ? "Fewer options ▴" : "Schedule time ▾"}
        </button>

        {showMoreOptions && (
          <div>
            <label className={label}>Schedule time</label>
            <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className={input} />
          </div>
        )}

        <button type="submit" disabled={creating} className={primaryButton}>
          {creating ? "Adding..." : "➕ Add task"}
        </button>
      </form>

      {error && <p className={`mb-4 ${errorText}`}>{error}</p>}

      {tasks.length > 0 && (
        <>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks..." aria-label="Search tasks" className={`mb-3 w-full ${input}`} />
          <div className="mb-6 flex flex-wrap gap-1.5">
            <Chip active={priorityFilter === "all"} onClick={() => setPriorityFilter("all")}>
              All priority
            </Chip>
            {PRIORITIES.map((p) => (
              <Chip key={p} active={priorityFilter === p} onClick={() => setPriorityFilter(priorityFilter === p ? "all" : p)}>
                {p}
              </Chip>
            ))}
            {categories.length > 0 && (
              <>
                <Chip active={categoryFilter === "all"} onClick={() => setCategoryFilter("all")}>
                  All categories
                </Chip>
                {categories.map((c) => (
                  <Chip key={c} active={categoryFilter === c} onClick={() => setCategoryFilter(categoryFilter === c ? "all" : c)}>
                    {c}
                  </Chip>
                ))}
              </>
            )}
          </div>
        </>
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
        <p className={mutedText}>No tasks match your filters.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {GROUP_ORDER.filter((g) => groupedTasks[g].length > 0).map((group) => (
            <div key={group}>
              <p className={`mb-2 border-l-2 border-stone pl-2 dark:border-stone-dark ${sectionLabel}`}>
                {group} <span className="normal-case text-mist-muted">({groupedTasks[group].length})</span>
              </p>
              <ul className="flex flex-col gap-3">
                {groupedTasks[group].map((task) => (
                  <TaskCard
                    key={task.taskId}
                    task={task}
                    isEditing={editingTaskId === task.taskId}
                    isQuickEditingTime={quickEditTimeTaskId === task.taskId}
                    onToggleEdit={() => (editingTaskId === task.taskId ? setEditingTaskId(null) : startEdit(task))}
                    onToggleQuickEditTime={() => setQuickEditTimeTaskId((prev) => (prev === task.taskId ? null : task.taskId))}
                    onUpdate={(patch) => updateTask(task.taskId, patch)}
                    onDuplicate={() => duplicateTask(task)}
                    onDelete={() => deleteTask(task)}
                    editDescription={editDescription}
                    setEditDescription={setEditDescription}
                    editDueDate={editDueDate}
                    setEditDueDate={setEditDueDate}
                    editDueTime={editDueTime}
                    setEditDueTime={setEditDueTime}
                    editReminderLead={editReminderLead}
                    setEditReminderLead={setEditReminderLead}
                    editEstimatedHours={editEstimatedHours}
                    setEditEstimatedHours={setEditEstimatedHours}
                    editCategory={editCategory}
                    setEditCategory={setEditCategory}
                    editSuggestPriority={editSuggestPriority}
                    setEditSuggestPriority={setEditSuggestPriority}
                    editRecurrence={editRecurrence}
                    setEditRecurrence={setEditRecurrence}
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
