import { useEffect, useState, type FormEvent } from "react";
import { Clock, Timer } from "lucide-react";
import { useApi } from "../api/useApi";
import { todayLocal } from "../lib/date";
import { ALL_DAYS, byTimeOfDay, formatSchedule } from "../lib/weekdays";
import { computeRoutineStreak, routineStreakWindowStart } from "../lib/routineStreak";
import { Skeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { StreakBadge } from "../components/StreakBadge";
import DayOfWeekPicker from "../components/DayOfWeekPicker";
import type { RoutineCategory, RoutineStepLog, RoutineTemplate } from "../types";
import {
  badge,
  card,
  errorText,
  input,
  label,
  page,
  pageTitle,
  pillButton,
  pillButtonDone,
  pillButtonInactive,
  pillButtonNotApplicable,
  pillButtonSkipped,
  primaryButton,
  secondaryButton,
  sectionLabel,
} from "../components/ui";

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

const ROUTINE_TEMPLATES: {
  label: string;
  category: RoutineCategory;
  name: string;
  steps: string[];
  timeOfDay?: string;
}[] = [
  {
    label: "AM skincare",
    category: "skinCare",
    name: "Morning skin care",
    steps: ["Cleanser", "Toner", "Moisturizer", "Sunscreen"],
    timeOfDay: "08:00",
  },
  {
    label: "PM skincare",
    category: "skinCare",
    name: "Evening skin care",
    steps: ["Cleanser", "Treatment", "Moisturizer"],
    timeOfDay: "21:00",
  },
  {
    label: "30-30-30",
    category: "dailyRoutine",
    name: "30-30-30 morning",
    steps: ["30g protein within 30 minutes of waking", "30 minutes of low-intensity exercise"],
    timeOfDay: "07:00",
  },
];


function today(): string {
  return todayLocal();
}

// Module-level (not nested in Routines) so React keeps element identity across
// re-renders — same reasoning as WishCard in Wishes.tsx.
function RoutineCard({
  routine,
  stepLogs,
  streak,
  pending,
  removing,
  onSetStepStatus,
  onDelete,
  onSave,
}: {
  routine: RoutineTemplate;
  stepLogs: Record<string, { status: RoutineStepLog["status"]; note?: string }>;
  streak: number;
  pending: string | null;
  removing: boolean;
  onSetStepStatus: (routineId: string, stepIndex: number, status: RoutineStepLog["status"], note?: string) => void;
  onDelete: (routineId: string) => void;
  onSave: (
    routineId: string,
    patch: {
      name: string;
      category: string;
      steps: string[];
      daysOfWeek: number[];
      timeOfDay?: string;
      estimatedMinutes?: number;
    },
  ) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(routine.name);
  const [categorySelect, setCategorySelect] = useState(
    isPresetCategory(routine.category) ? routine.category : CUSTOM_CATEGORY_OPTION,
  );
  const [customCategoryDraft, setCustomCategoryDraft] = useState(
    isPresetCategory(routine.category) ? "" : routine.category,
  );
  const [stepsDraft, setStepsDraft] = useState(routine.steps.join("\n"));
  const [daysDraft, setDaysDraft] = useState<number[]>(
    routine.daysOfWeek && routine.daysOfWeek.length > 0 ? routine.daysOfWeek : ALL_DAYS,
  );
  const [timeOfDayDraft, setTimeOfDayDraft] = useState(routine.timeOfDay ?? "");
  const [estimatedMinutesDraft, setEstimatedMinutesDraft] = useState(
    routine.estimatedMinutes !== undefined ? String(routine.estimatedMinutes) : "",
  );
  const [savingEdit, setSavingEdit] = useState(false);

  const doneCount = routine.steps.filter(
    (_, index) => stepLogs[`${routine.routineId}#${index}`]?.status === "done",
  ).length;

  function toggleDraftDay(day: number) {
    setDaysDraft((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  }

  const categoryDraft = categorySelect === CUSTOM_CATEGORY_OPTION ? customCategoryDraft.trim() : categorySelect;

  async function handleSaveEdit() {
    const steps = stepsDraft
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!nameDraft.trim() || !categoryDraft || steps.length === 0 || daysDraft.length === 0) return;
    setSavingEdit(true);
    try {
      await onSave(routine.routineId, {
        name: nameDraft.trim(),
        category: categoryDraft,
        steps,
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
            <select
              value={categorySelect}
              onChange={(e) => setCategorySelect(e.target.value)}
              className={input}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
              <option value={CUSTOM_CATEGORY_OPTION}>Custom…</option>
            </select>
            {categorySelect === CUSTOM_CATEGORY_OPTION && (
              <input
                type="text"
                value={customCategoryDraft}
                onChange={(e) => setCustomCategoryDraft(e.target.value)}
                placeholder="e.g. Bodycare"
                maxLength={40}
                className={`mt-1.5 w-full ${input}`}
              />
            )}
          </div>
          <div className="min-w-[200px] flex-1">
            <label className={label}>Name</label>
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className={`w-full ${input}`}
            />
          </div>
        </div>
        <label className={label}>Steps (one per line)</label>
        <textarea
          rows={4}
          value={stepsDraft}
          onChange={(e) => setStepsDraft(e.target.value)}
          className={`mb-2 w-full ${input}`}
        />
        <label className={label}>Days</label>
        <div className="mb-2">
          <DayOfWeekPicker selected={daysDraft} onToggle={toggleDraftDay} />
        </div>
        <div className="mb-2 flex flex-wrap gap-3">
          <div>
            <label className={label}>Time of day (optional — sorts the checklist morning to evening)</label>
            <input
              type="time"
              value={timeOfDayDraft}
              onChange={(e) => setTimeOfDayDraft(e.target.value)}
              className={`w-32 ${input}`}
            />
          </div>
          <div>
            <label className={label}>Takes about (min, optional)</label>
            <input
              type="number"
              min={1}
              value={estimatedMinutesDraft}
              onChange={(e) => setEstimatedMinutesDraft(e.target.value)}
              placeholder="e.g. 8"
              className={`w-24 ${input}`}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={savingEdit || daysDraft.length === 0 || !categoryDraft}
            onClick={handleSaveEdit}
            className={`${secondaryButton} px-3 py-1 text-xs`}
          >
            {savingEdit ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className={`${secondaryButton} px-3 py-1 text-xs`}
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`transition-all duration-200 ${card} ${removing ? "scale-[0.98] opacity-0" : "scale-100 opacity-100"}`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink dark:text-paper">
          {routine.name}{" "}
          <span className="font-normal text-ink-muted dark:text-mist-muted">
            ({categoryLabel(routine.category)})
          </span>{" "}
          <span className={badge}>
            {doneCount}/{routine.steps.length} done
          </span>{" "}
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
          {streak > 0 && (
            <span className="ml-1.5">
              <StreakBadge days={streak} />
            </span>
          )}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-bloom hover:underline"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={pending === routine.routineId}
            onClick={() => onDelete(routine.routineId)}
            className={`${secondaryButton} px-2 py-1 text-xs`}
          >
            Delete
          </button>
        </div>
      </div>
      <ul className="flex flex-col gap-1.5">
        {routine.steps.map((step, index) => {
          const key = `${routine.routineId}#${index}`;
          const log = stepLogs[key];
          const status = log?.status;
          return (
            <li key={key} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-ink-muted dark:text-mist-muted">{step}</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={pending === key}
                    onClick={() => onSetStepStatus(routine.routineId, index, "done")}
                    className={`${pillButton} px-2.5 py-0.5 ${
                      status === "done" ? pillButtonDone : pillButtonInactive
                    }`}
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    disabled={pending === key}
                    onClick={() => onSetStepStatus(routine.routineId, index, "skipped")}
                    className={`${pillButton} px-2.5 py-0.5 ${
                      status === "skipped" ? pillButtonSkipped : pillButtonInactive
                    }`}
                  >
                    Skipped
                  </button>
                  <button
                    type="button"
                    disabled={pending === key}
                    onClick={() => onSetStepStatus(routine.routineId, index, "not_applicable")}
                    title="Doesn't apply today — won't break the streak"
                    className={`${pillButton} px-2.5 py-0.5 ${
                      status === "not_applicable" ? pillButtonNotApplicable : pillButtonInactive
                    }`}
                  >
                    N/A
                  </button>
                </div>
              </div>
              {status === "not_applicable" && (
                <input
                  type="text"
                  defaultValue={log?.note ?? ""}
                  onBlur={(e) => {
                    const trimmed = e.target.value.trim();
                    if (trimmed !== (log?.note ?? "")) {
                      onSetStepStatus(routine.routineId, index, "not_applicable", trimmed);
                    }
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
    </li>
  );
}

export default function Routines() {
  const { request } = useApi();
  const [routines, setRoutines] = useState<RoutineTemplate[]>([]);
  const [stepLogs, setStepLogs] = useState<Record<string, { status: RoutineStepLog["status"]; note?: string }>>({});
  const [rangeLogs, setRangeLogs] = useState<RoutineStepLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categorySelect, setCategorySelect] = useState<string>("skinCare");
  const [customCategoryDraft, setCustomCategoryDraft] = useState("");
  const [name, setName] = useState("");
  const [stepsText, setStepsText] = useState("");
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
          request<{ logs: RoutineStepLog[] }>(`/routine-logs/${today()}`),
          request<{ logs: RoutineStepLog[] }>(`/routine-logs?from=${windowStart}&to=${today()}`),
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
  }, []);

  function applyTemplate(template: (typeof ROUTINE_TEMPLATES)[number]) {
    setCategorySelect(template.category);
    setCustomCategoryDraft("");
    setName(template.name);
    setStepsText(template.steps.join("\n"));
    setTimeOfDay(template.timeOfDay ?? "");
  }

  function toggleDay(day: number) {
    setDaysOfWeek((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const category = categorySelect === CUSTOM_CATEGORY_OPTION ? customCategoryDraft.trim() : categorySelect;
    const steps = stepsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!name.trim() || !category || steps.length === 0 || daysOfWeek.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const routine = await request<RoutineTemplate>("/routines", {
        method: "POST",
        body: JSON.stringify({
          category,
          name: name.trim(),
          steps,
          daysOfWeek: daysOfWeek.length === 7 ? [] : daysOfWeek,
          timeOfDay: timeOfDay || undefined,
          estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,
        }),
      });
      setRoutines((prev) => [routine, ...prev]);
      setName("");
      setStepsText("");
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

  async function handleSaveEdit(
    routineId: string,
    patch: { name: string; category: string; steps: string[]; daysOfWeek: number[]; timeOfDay?: string },
  ) {
    setError(null);
    try {
      const updated = await request<RoutineTemplate>(`/routines/${routineId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setRoutines((prev) => prev.map((r) => (r.routineId === routineId ? updated : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save routine");
      throw err;
    }
  }

  async function setStepStatus(
    routineId: string,
    stepIndex: number,
    status: RoutineStepLog["status"],
    note?: string,
  ) {
    const key = `${routineId}#${stepIndex}`;
    setPending(key);
    setError(null);
    try {
      const updated = await request<RoutineStepLog>(
        `/routine-logs/${today()}/${routineId}/${stepIndex}`,
        { method: "PATCH", body: JSON.stringify({ status, ...(note !== undefined ? { note } : {}) }) },
      );
      setStepLogs((prev) => ({ ...prev, [key]: { status: updated.status, note: updated.note } }));
      setRangeLogs((prev) => [
        ...prev.filter((l) => l.dateRoutineStep !== updated.dateRoutineStep),
        updated,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update step");
    } finally {
      setPending(null);
    }
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
              <button
                key={template.label}
                type="button"
                onClick={() => applyTemplate(template)}
                className={`${pillButton} ${pillButtonInactive} px-3 py-1`}
              >
                {template.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <div>
            <label className={label}>Category</label>
            <select
              value={categorySelect}
              onChange={(e) => setCategorySelect(e.target.value)}
              className={input}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
              <option value={CUSTOM_CATEGORY_OPTION}>Custom…</option>
            </select>
            {categorySelect === CUSTOM_CATEGORY_OPTION && (
              <input
                type="text"
                value={customCategoryDraft}
                onChange={(e) => setCustomCategoryDraft(e.target.value)}
                placeholder="e.g. Bodycare"
                maxLength={40}
                className={`mt-1.5 w-full ${input}`}
              />
            )}
          </div>
          <div className="min-w-[200px] flex-1">
            <label className={label}>Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Morning skin care"
              className={`w-full ${input}`}
            />
          </div>
        </div>
        <div>
          <label className={label}>Steps (one per line)</label>
          <textarea
            required
            rows={4}
            value={stepsText}
            onChange={(e) => setStepsText(e.target.value)}
            placeholder={"Cleanser\nToner\nMoisturizer"}
            className={`w-full ${input}`}
          />
        </div>
        <div>
          <label className={label}>Days</label>
          <DayOfWeekPicker selected={daysOfWeek} onToggle={toggleDay} />
        </div>
        <div className="flex flex-wrap gap-3">
          <div>
            <label className={label}>Time of day (optional — sorts the checklist morning to evening)</label>
            <input
              type="time"
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(e.target.value)}
              className={`w-32 ${input}`}
            />
          </div>
          <div>
            <label className={label}>Takes about (min, optional)</label>
            <input
              type="number"
              min={1}
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
              placeholder="e.g. 8"
              className={`w-24 ${input}`}
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={
            saving ||
            daysOfWeek.length === 0 ||
            (categorySelect === CUSTOM_CATEGORY_OPTION && !customCategoryDraft.trim())
          }
          className={`self-start ${primaryButton}`}
        >
          {saving ? "Adding..." : "Add routine"}
        </button>
      </form>

      {error && <p className={`mb-4 ${errorText}`}>{error}</p>}

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          <h2 className={`mb-2 ${sectionLabel}`}>Today's checklist ({today()})</h2>
          {routines.length === 0 ? (
            <div className="mb-6">
              <EmptyState icon="🪞" title="No routines yet" hint="Add your first routine above." />
            </div>
          ) : (
            <ul className="mb-6 flex flex-col gap-3">
              {[...routines].sort(byTimeOfDay).map((routine) => (
                <RoutineCard
                  key={routine.routineId}
                  routine={routine}
                  stepLogs={stepLogs}
                  streak={computeRoutineStreak(routine, logsByDateStep)}
                  pending={pending}
                  removing={removingId === routine.routineId}
                  onSetStepStatus={setStepStatus}
                  onDelete={handleDelete}
                  onSave={handleSaveEdit}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
