import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Clock, MinusCircle, SkipForward, Timer, X } from "lucide-react";
import { useApi } from "../api/useApi";
import { addDays, isValidDateStr, todayLocal } from "../lib/date";
import { ALL_DAYS, byTimeOfDay, formatSchedule } from "../lib/weekdays";
import { computeRoutineStreak, routineStreakWindowStart } from "../lib/routineStreak";
import { Skeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { StreakBadge } from "../components/StreakBadge";
import DayOfWeekPicker from "../components/DayOfWeekPicker";
import type { RoutineCategory, RoutineStepLog, RoutineTemplate } from "../types";
import { badge, card, errorText, input, label, mutedText, page, pageTitle, primaryButton, secondaryButton, sectionLabel } from "../components/ui";

const CATEGORY_LABEL: Record<RoutineCategory, string> = {
  skinCare: "Skin care",
  hairCare: "Hair care",
  dailyRoutine: "Daily routine",
};

const CATEGORIES = Object.keys(CATEGORY_LABEL) as RoutineCategory[];

// Sentinel for "Custom…" in the category <select> — never itself persisted. category is a
// free-text string on RoutineTemplate, so this just switches the picker to a text input instead
// of one of the three named presets.
const CUSTOM_CATEGORY_OPTION = "__custom__";

function isPresetCategory(category: string): category is RoutineCategory {
  return (CATEGORIES as string[]).includes(category);
}

// Falls back to the raw stored value for a category that isn't one of the three presets
// (e.g. "bodycare") rather than showing nothing or an "undefined" label.
function categoryLabel(category: string): string {
  return isPresetCategory(category) ? CATEGORY_LABEL[category] : category;
}

const ROUTINE_TEMPLATES: { label: string; category: RoutineCategory; name: string; steps: string[]; timeOfDay?: string }[] = [
  { label: "AM skincare", category: "skinCare", name: "Morning skin care", steps: ["Cleanser", "Toner", "Moisturizer", "Sunscreen"], timeOfDay: "08:00" },
  { label: "PM skincare", category: "skinCare", name: "Evening skin care", steps: ["Cleanser", "Treatment", "Moisturizer"], timeOfDay: "21:00" },
  { label: "30-30-30", category: "dailyRoutine", name: "30-30-30 morning", steps: ["30g protein within 30 minutes of waking", "30 minutes of low-intensity exercise"], timeOfDay: "07:00" },
];

function compactDateLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// Icon + label, never color alone — same success/muted/slate scheme the Today screen's
// routine steps use (done=green, skipped=muted neutral, not_applicable=blue-gray).
const STATUS_BUTTON_CLASS: Record<RoutineStepLog["status"], string> = {
  done: "border-success bg-success text-paper-card",
  skipped: "border-mist-muted bg-mist-muted text-paper-card",
  not_applicable: "border-slate bg-slate text-paper-card",
};
const INACTIVE_STATUS_CLASS = "border-stone text-ink-muted hover:bg-stone/40 dark:border-stone-dark dark:text-mist-muted dark:hover:bg-stone-dark/40";

function StepStatusButtons({
  status,
  pending,
  editable,
  onSetStatus,
}: {
  status: RoutineStepLog["status"] | undefined;
  pending: boolean;
  editable: boolean;
  onSetStatus: (status: RoutineStepLog["status"]) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {(["done", "skipped", "not_applicable"] as RoutineStepLog["status"][]).map((candidate) => {
        const active = status === candidate;
        return (
          <button
            key={candidate}
            type="button"
            disabled={pending || !editable}
            onClick={() => onSetStatus(candidate)}
            aria-pressed={active}
            className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-control border px-2.5 text-xs font-medium transition-colors disabled:opacity-60 ${
              active ? STATUS_BUTTON_CLASS[candidate] : INACTIVE_STATUS_CLASS
            }`}
          >
            <Icon icon={candidate === "done" ? Check : candidate === "skipped" ? X : MinusCircle} size={13} strokeWidth={2.4} />
            {candidate === "done" ? "Done" : candidate === "skipped" ? "Skipped" : "N/A"}
          </button>
        );
      })}
    </div>
  );
}

// Add/remove/reorder steps with up/down controls — replaces a free-text "one per line"
// textarea so step order is an explicit, visible action rather than cut-and-paste editing.
function StepListEditor({ steps, onChange }: { steps: string[]; onChange: (steps: string[]) => void }) {
  function updateStep(i: number, value: string) {
    const next = [...steps];
    next[i] = value;
    onChange(next);
  }
  function removeStep(i: number) {
    onChange(steps.filter((_, idx) => idx !== i));
  }
  function moveStep(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="flex flex-col gap-0.5">
            <button type="button" disabled={i === 0} onClick={() => moveStep(i, -1)} aria-label={`Move step ${i + 1} up`} className="flex h-5 w-6 items-center justify-center rounded text-ink-muted hover:bg-stone/40 disabled:opacity-30 dark:text-mist-muted dark:hover:bg-stone-dark/40">
              <Icon icon={ArrowUp} size={11} />
            </button>
            <button type="button" disabled={i === steps.length - 1} onClick={() => moveStep(i, 1)} aria-label={`Move step ${i + 1} down`} className="flex h-5 w-6 items-center justify-center rounded text-ink-muted hover:bg-stone/40 disabled:opacity-30 dark:text-mist-muted dark:hover:bg-stone-dark/40">
              <Icon icon={ArrowDown} size={11} />
            </button>
          </div>
          <input type="text" value={step} onChange={(e) => updateStep(i, e.target.value)} placeholder={`Step ${i + 1}`} className={`flex-1 ${input}`} />
          <button type="button" onClick={() => removeStep(i)} aria-label={`Remove step ${i + 1}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-stone/40 dark:text-mist-muted dark:hover:bg-stone-dark/40">
            <Icon icon={X} size={14} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...steps, ""])} className={`${secondaryButton} self-start px-3 py-1.5 text-xs`}>
        + Add step
      </button>
    </div>
  );
}

// Module-level (not nested in Routines) so React keeps element identity across re-renders.
function RoutineCard({
  routine,
  stepLogs,
  streak,
  pending,
  removing,
  editable,
  onSetStepStatus,
  onMarkAllDone,
  onSkipRemaining,
  onDelete,
  onSave,
}: {
  routine: RoutineTemplate;
  stepLogs: Record<string, { status: RoutineStepLog["status"]; note?: string }>;
  streak: { current: number; pausedToday: boolean };
  pending: string | null;
  removing: boolean;
  editable: boolean;
  onSetStepStatus: (routineId: string, stepIndex: number, status: RoutineStepLog["status"], note?: string) => void;
  onMarkAllDone: (routine: RoutineTemplate) => void;
  onSkipRemaining: (routine: RoutineTemplate) => void;
  onDelete: (routineId: string) => void;
  onSave: (routineId: string, patch: { name: string; category: string; steps: string[]; daysOfWeek: number[]; timeOfDay?: string; estimatedMinutes?: number }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(routine.name);
  const [categorySelect, setCategorySelect] = useState(isPresetCategory(routine.category) ? routine.category : CUSTOM_CATEGORY_OPTION);
  const [customCategoryDraft, setCustomCategoryDraft] = useState(isPresetCategory(routine.category) ? "" : routine.category);
  const [stepsDraft, setStepsDraft] = useState<string[]>(routine.steps);
  const [daysDraft, setDaysDraft] = useState<number[]>(routine.daysOfWeek && routine.daysOfWeek.length > 0 ? routine.daysOfWeek : ALL_DAYS);
  const [timeOfDayDraft, setTimeOfDayDraft] = useState(routine.timeOfDay ?? "");
  const [estimatedMinutesDraft, setEstimatedMinutesDraft] = useState(routine.estimatedMinutes !== undefined ? String(routine.estimatedMinutes) : "");
  const [savingEdit, setSavingEdit] = useState(false);

  const doneCount = routine.steps.filter((_, index) => stepLogs[`${routine.routineId}#${index}`]?.status === "done").length;
  const pendingCount = routine.steps.filter((_, index) => stepLogs[`${routine.routineId}#${index}`] === undefined).length;

  function toggleDraftDay(day: number) {
    setDaysDraft((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  }

  const categoryDraft = categorySelect === CUSTOM_CATEGORY_OPTION ? customCategoryDraft.trim() : categorySelect;
  const cleanSteps = stepsDraft.map((s) => s.trim()).filter(Boolean);

  async function handleSaveEdit() {
    if (!nameDraft.trim() || !categoryDraft || cleanSteps.length === 0 || daysDraft.length === 0) return;
    setSavingEdit(true);
    try {
      await onSave(routine.routineId, {
        name: nameDraft.trim(),
        category: categoryDraft,
        steps: cleanSteps,
        daysOfWeek: daysDraft.length === 7 ? [] : daysDraft,
        timeOfDay: timeOfDayDraft || undefined,
        estimatedMinutes: estimatedMinutesDraft ? Number(estimatedMinutesDraft) : undefined,
      });
      setEditing(false);
    } finally {
      setSavingEdit(false);
    }
  }

  if (editing) {
    return (
      <li className={card}>
        <div className="mb-2 flex flex-wrap gap-3">
          <div>
            <label className={label}>Category</label>
            <select value={categorySelect} onChange={(e) => setCategorySelect(e.target.value)} className={input}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
              <option value={CUSTOM_CATEGORY_OPTION}>Custom…</option>
            </select>
            {categorySelect === CUSTOM_CATEGORY_OPTION && (
              <input type="text" value={customCategoryDraft} onChange={(e) => setCustomCategoryDraft(e.target.value)} placeholder="e.g. Bodycare" maxLength={40} className={`mt-1.5 w-full ${input}`} />
            )}
          </div>
          <div className="min-w-[200px] flex-1">
            <label className={label}>Name</label>
            <input type="text" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className={`w-full ${input}`} />
          </div>
        </div>
        <label className={label}>Steps</label>
        <div className="mb-2">
          <StepListEditor steps={stepsDraft} onChange={setStepsDraft} />
        </div>
        <label className={label}>Days</label>
        <div className="mb-2">
          <DayOfWeekPicker selected={daysDraft} onToggle={toggleDraftDay} />
        </div>
        <div className="mb-2 flex flex-wrap gap-3">
          <div>
            <label className={label}>Time of day (optional — sorts the checklist morning to evening)</label>
            <input type="time" value={timeOfDayDraft} onChange={(e) => setTimeOfDayDraft(e.target.value)} className={`w-32 ${input}`} />
          </div>
          <div>
            <label className={label}>Takes about (min, optional)</label>
            <input type="number" min={1} value={estimatedMinutesDraft} onChange={(e) => setEstimatedMinutesDraft(e.target.value)} placeholder="e.g. 8" className={`w-24 ${input}`} />
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={savingEdit || daysDraft.length === 0 || !categoryDraft || cleanSteps.length === 0} onClick={handleSaveEdit} className={`${secondaryButton} min-h-10 px-3 text-xs`}>
            {savingEdit ? "Saving..." : "Save"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className={`${secondaryButton} min-h-10 px-3 text-xs`}>
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className={`transition-all duration-200 ${card} ${removing ? "scale-[0.98] opacity-0" : "scale-100 opacity-100"}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink dark:text-paper">{routine.name}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing(true)} className={`${secondaryButton} min-h-9 px-2.5 text-xs`}>
            Edit
          </button>
          <button type="button" disabled={pending === routine.routineId} onClick={() => onDelete(routine.routineId)} className={`${secondaryButton} min-h-9 px-2.5 text-xs`}>
            Delete
          </button>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5 tabular-nums">
        <span className="font-normal text-xs text-ink-muted dark:text-mist-muted">{categoryLabel(routine.category)}</span>
        <span className={badge}>
          {doneCount}/{routine.steps.length} done
        </span>
        <span className={badge}>{formatSchedule(routine.daysOfWeek)}</span>
        {routine.timeOfDay && (
          <span className={`${badge} inline-flex items-center gap-1`}>
            <Icon icon={Clock} size={12} />
            {routine.timeOfDay}
          </span>
        )}
        {routine.estimatedMinutes !== undefined && (
          <span className={`${badge} inline-flex items-center gap-1`}>
            <Icon icon={Timer} size={12} />~{routine.estimatedMinutes} min
          </span>
        )}
        {streak.current > 0 && <StreakBadge days={streak.current} paused={streak.pausedToday} />}
      </div>
      <ul className="flex flex-col gap-3">
        {routine.steps.map((step, index) => {
          const key = `${routine.routineId}#${index}`;
          const log = stepLogs[key];
          const status = log?.status;
          return (
            <li key={key} className="flex flex-col gap-1.5">
              <p className="text-sm text-ink dark:text-paper" style={{ overflowWrap: "anywhere" }}>
                {step}
              </p>
              <StepStatusButtons status={status} pending={pending === key} editable={editable} onSetStatus={(next) => onSetStepStatus(routine.routineId, index, next)} />
              {status === "not_applicable" && (
                <input
                  type="text"
                  defaultValue={log?.note ?? ""}
                  disabled={!editable}
                  onBlur={(e) => {
                    const trimmed = e.target.value.trim();
                    if (trimmed !== (log?.note ?? "")) onSetStepStatus(routine.routineId, index, "not_applicable", trimmed);
                  }}
                  placeholder="Why not applicable? (optional)"
                  maxLength={200}
                  className={`py-1 text-xs ${input}`}
                />
              )}
            </li>
          );
        })}
      </ul>
      {editable ? (
        pendingCount > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => onMarkAllDone(routine)} className="inline-flex min-h-10 items-center gap-1.5 rounded-control border border-success px-3 text-xs font-medium text-success-ink hover:bg-success-soft dark:text-success-ink-dark dark:hover:bg-success-soft-dark">
              <Icon icon={Check} size={13} />
              Mark all done
            </button>
            <button type="button" onClick={() => onSkipRemaining(routine)} className="inline-flex min-h-10 items-center gap-1.5 rounded-control border border-stone px-3 text-xs font-medium text-ink-muted hover:bg-stone/40 dark:border-stone-dark dark:text-mist-muted dark:hover:bg-stone-dark/40">
              <Icon icon={SkipForward} size={13} />
              Skip remaining
            </button>
          </div>
        )
      ) : (
        <p className="mt-3 text-xs text-ink-muted dark:text-mist-muted">Can't mark future items</p>
      )}
    </li>
  );
}

export default function Routines() {
  const { request } = useApi();
  const [searchParams, setSearchParams] = useSearchParams();
  const [routines, setRoutines] = useState<RoutineTemplate[]>([]);
  const [stepLogs, setStepLogs] = useState<Record<string, { status: RoutineStepLog["status"]; note?: string }>>({});
  const [rangeLogs, setRangeLogs] = useState<RoutineStepLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const realToday = todayLocal();
  const dateParam = searchParams.get("date");
  const selectedDate = dateParam && isValidDateStr(dateParam) ? dateParam : realToday;
  const isToday = selectedDate === realToday;
  const editable = selectedDate <= realToday;

  function goToDate(date: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (date === realToday) next.delete("date");
      else next.set("date", date);
      return next;
    });
  }

  const [categorySelect, setCategorySelect] = useState<string>("skinCare");
  const [customCategoryDraft, setCustomCategoryDraft] = useState("");
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<string[]>([""]);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(ALL_DAYS);
  const [timeOfDay, setTimeOfDay] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const windowStart = routineStreakWindowStart();
        const [routinesData, logsData, rangeLogsData] = await Promise.all([
          request<{ routines: RoutineTemplate[] }>("/routines"),
          request<{ logs: RoutineStepLog[] }>(`/routine-logs/${selectedDate}`),
          request<{ logs: RoutineStepLog[] }>(`/routine-logs?from=${windowStart}&to=${realToday}`),
        ]);
        if (ignore) return;
        setRoutines(routinesData.routines);
        const next: Record<string, { status: RoutineStepLog["status"]; note?: string }> = {};
        for (const log of logsData.logs) next[`${log.routineId}#${log.stepIndex}`] = { status: log.status, note: log.note };
        setStepLogs(next);
        setRangeLogs(rangeLogsData.logs);
      } catch (err) {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Failed to load routines");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    load();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  function applyTemplate(template: (typeof ROUTINE_TEMPLATES)[number]) {
    setCategorySelect(template.category);
    setCustomCategoryDraft("");
    setName(template.name);
    setSteps(template.steps);
    setTimeOfDay(template.timeOfDay ?? "");
  }

  function toggleDay(day: number) {
    setDaysOfWeek((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  }

  const cleanNewSteps = steps.map((s) => s.trim()).filter(Boolean);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const category = categorySelect === CUSTOM_CATEGORY_OPTION ? customCategoryDraft.trim() : categorySelect;
    if (!name.trim() || !category || cleanNewSteps.length === 0 || daysOfWeek.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const routine = await request<RoutineTemplate>("/routines", {
        method: "POST",
        body: JSON.stringify({
          category,
          name: name.trim(),
          steps: cleanNewSteps,
          daysOfWeek: daysOfWeek.length === 7 ? [] : daysOfWeek,
          timeOfDay: timeOfDay || undefined,
          estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,
        }),
      });
      setRoutines((prev) => [routine, ...prev]);
      setName("");
      setSteps([""]);
      setDaysOfWeek(ALL_DAYS);
      setTimeOfDay("");
      setEstimatedMinutes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add routine");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(routineId: string) {
    setPending(routineId);
    setRemovingId(routineId);
    setError(null);
    const transitionDone = new Promise((resolve) => setTimeout(resolve, 200));
    try {
      await Promise.all([request(`/routines/${routineId}`, { method: "DELETE" }), transitionDone]);
      setRoutines((prev) => prev.filter((r) => r.routineId !== routineId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete routine");
    } finally {
      setPending(null);
      setRemovingId(null);
    }
  }

  async function handleSaveEdit(routineId: string, patch: { name: string; category: string; steps: string[]; daysOfWeek: number[]; timeOfDay?: string; estimatedMinutes?: number }) {
    setError(null);
    try {
      const updated = await request<RoutineTemplate>(`/routines/${routineId}`, { method: "PATCH", body: JSON.stringify(patch) });
      setRoutines((prev) => prev.map((r) => (r.routineId === routineId ? updated : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save routine");
      throw err;
    }
  }

  async function setStepStatus(routineId: string, stepIndex: number, status: RoutineStepLog["status"], note?: string) {
    if (!editable) return;
    const key = `${routineId}#${stepIndex}`;
    setPending(key);
    setError(null);
    try {
      const updated = await request<RoutineStepLog>(`/routine-logs/${selectedDate}/${routineId}/${stepIndex}`, { method: "PATCH", body: JSON.stringify({ status, ...(note !== undefined ? { note } : {}) }) });
      setStepLogs((prev) => ({ ...prev, [key]: { status: updated.status, note: updated.note } }));
      if (isToday) setRangeLogs((prev) => [...prev.filter((l) => l.dateRoutineStep !== updated.dateRoutineStep), updated]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update step");
    } finally {
      setPending(null);
    }
  }

  async function markAllDone(routine: RoutineTemplate) {
    const pendingSteps = routine.steps.map((_, i) => i).filter((i) => stepLogs[`${routine.routineId}#${i}`] === undefined);
    await Promise.all(pendingSteps.map((i) => setStepStatus(routine.routineId, i, "done")));
  }

  async function skipRemaining(routine: RoutineTemplate) {
    const pendingSteps = routine.steps.map((_, i) => i).filter((i) => stepLogs[`${routine.routineId}#${i}`] === undefined);
    await Promise.all(pendingSteps.map((i) => setStepStatus(routine.routineId, i, "skipped")));
  }

  const logsByDateStep = new Map<string, RoutineStepLog["status"]>();
  for (const log of rangeLogs) logsByDateStep.set(`${log.date}#${log.routineId}#${log.stepIndex}`, log.status);

  return (
    <div className={page}>
      <h1 className={pageTitle}>Routines</h1>

      <form onSubmit={handleAdd} className={`mb-8 flex flex-col gap-3 ${card}`}>
        <div>
          <label className={label}>Templates</label>
          <div className="flex flex-wrap gap-1.5">
            {ROUTINE_TEMPLATES.map((template) => (
              <button key={template.label} type="button" onClick={() => applyTemplate(template)} className={`${secondaryButton} min-h-10 px-3 text-xs`}>
                {template.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <div>
            <label className={label}>Category</label>
            <select value={categorySelect} onChange={(e) => setCategorySelect(e.target.value)} className={input}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
              <option value={CUSTOM_CATEGORY_OPTION}>Custom…</option>
            </select>
            {categorySelect === CUSTOM_CATEGORY_OPTION && (
              <input type="text" value={customCategoryDraft} onChange={(e) => setCustomCategoryDraft(e.target.value)} placeholder="e.g. Bodycare" maxLength={40} className={`mt-1.5 w-full ${input}`} />
            )}
          </div>
          <div className="min-w-[200px] flex-1">
            <label className={label}>Name</label>
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Morning skin care" className={`w-full ${input}`} />
          </div>
        </div>
        <div>
          <label className={label}>Steps</label>
          <StepListEditor steps={steps} onChange={setSteps} />
        </div>
        <div>
          <label className={label}>Days</label>
          <DayOfWeekPicker selected={daysOfWeek} onToggle={toggleDay} />
        </div>
        <div className="flex flex-wrap gap-3">
          <div>
            <label className={label}>Time of day (optional — sorts the checklist morning to evening)</label>
            <input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} className={`w-32 ${input}`} />
          </div>
          <div>
            <label className={label}>Takes about (min, optional)</label>
            <input type="number" min={1} value={estimatedMinutes} onChange={(e) => setEstimatedMinutes(e.target.value)} placeholder="e.g. 8" className={`w-24 ${input}`} />
          </div>
        </div>
        <button
          type="submit"
          disabled={saving || daysOfWeek.length === 0 || cleanNewSteps.length === 0 || (categorySelect === CUSTOM_CATEGORY_OPTION && !customCategoryDraft.trim())}
          className={`self-start ${primaryButton}`}
        >
          {saving ? "Adding..." : "Add routine"}
        </button>
      </form>

      {error && <p className={`mb-4 ${errorText}`}>{error}</p>}

      <div className="mb-4 flex items-center gap-2">
        <button type="button" onClick={() => goToDate(addDays(selectedDate, -1))} aria-label="Previous day" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone text-ink-muted hover:bg-stone/40 dark:border-stone-dark dark:text-mist-muted dark:hover:bg-stone-dark/40">
          <Icon icon={ChevronLeft} size={16} />
        </button>
        <div className="relative min-w-0 flex-1 text-center">
          <h2 className={`truncate ${sectionLabel}`} style={{ textTransform: "none" }}>
            {isToday ? "Today's checklist" : "Checklist"} — {compactDateLabel(selectedDate)}
          </h2>
          <input type="date" value={selectedDate} onChange={(e) => e.target.value && isValidDateStr(e.target.value) && goToDate(e.target.value)} aria-label="Pick a date" className="absolute inset-0 cursor-pointer opacity-0" />
        </div>
        <button type="button" onClick={() => goToDate(addDays(selectedDate, 1))} aria-label="Next day" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone text-ink-muted hover:bg-stone/40 dark:border-stone-dark dark:text-mist-muted dark:hover:bg-stone-dark/40">
          <Icon icon={ChevronRight} size={16} />
        </button>
        {!isToday && (
          <button type="button" onClick={() => goToDate(realToday)} className="shrink-0 rounded-control border border-bloom px-2.5 py-1.5 text-xs font-medium text-bloom hover:bg-bloom-soft dark:hover:bg-bloom-soft-dark">
            Today
          </button>
        )}
      </div>
      {!editable && <p className={`mb-3 ${mutedText}`}>Viewing {compactDateLabel(selectedDate)} — planning view, can't mark future items.</p>}

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-2xl" />
        </div>
      ) : routines.length === 0 ? (
        <EmptyState icon="🪞" title="No routines yet" hint="Add your first routine above." />
      ) : (
        <ul className="flex flex-col gap-3">
          {[...routines].sort(byTimeOfDay).map((routine) => (
            <RoutineCard
              key={routine.routineId}
              routine={routine}
              stepLogs={stepLogs}
              streak={computeRoutineStreak(routine, logsByDateStep)}
              pending={pending}
              removing={removingId === routine.routineId}
              editable={editable}
              onSetStepStatus={setStepStatus}
              onMarkAllDone={markAllDone}
              onSkipRemaining={skipRemaining}
              onDelete={handleDelete}
              onSave={handleSaveEdit}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
