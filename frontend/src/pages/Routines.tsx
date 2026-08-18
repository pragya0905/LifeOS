import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../api/useApi";
import { todayLocal } from "../lib/date";
import type { RoutineCategory, RoutineStepLog, RoutineTemplate } from "../types";
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
  secondaryButton,
  sectionLabel,
} from "../components/ui";

const CATEGORY_LABEL: Record<RoutineCategory, string> = {
  skinCare: "Skin care",
  hairCare: "Hair care",
  dailyRoutine: "Daily routine",
  custom: "Custom",
};

const CATEGORIES = Object.keys(CATEGORY_LABEL) as RoutineCategory[];

const ROUTINE_TEMPLATES: { label: string; category: RoutineCategory; name: string; steps: string[] }[] = [
  {
    label: "AM skincare",
    category: "skinCare",
    name: "Morning skin care",
    steps: ["Cleanser", "Toner", "Moisturizer", "Sunscreen"],
  },
  {
    label: "PM skincare",
    category: "skinCare",
    name: "Evening skin care",
    steps: ["Cleanser", "Treatment", "Moisturizer"],
  },
  {
    label: "30-30-30",
    category: "dailyRoutine",
    name: "30-30-30 morning",
    steps: ["30g protein within 30 minutes of waking", "30 minutes of low-intensity exercise"],
  },
];

const pillButtonDone = "border-sage bg-sage text-cream-card";
const pillButtonSkipped = "border-fog-muted bg-fog-muted text-cream-card";

function today(): string {
  return todayLocal();
}

export default function Routines() {
  const { request } = useApi();
  const [routines, setRoutines] = useState<RoutineTemplate[]>([]);
  const [stepStatuses, setStepStatuses] = useState<Record<string, RoutineStepLog["status"]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<RoutineCategory>("skinCare");
  const [name, setName] = useState("");
  const [stepsText, setStepsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [routinesData, logsData] = await Promise.all([
          request<{ routines: RoutineTemplate[] }>("/routines"),
          request<{ logs: RoutineStepLog[] }>(`/routine-logs/${today()}`),
        ]);
        if (ignore) return;
        setRoutines(routinesData.routines);
        const next: Record<string, RoutineStepLog["status"]> = {};
        for (const log of logsData.logs) next[`${log.routineId}#${log.stepIndex}`] = log.status;
        setStepStatuses(next);
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
    setCategory(template.category);
    setName(template.name);
    setStepsText(template.steps.join("\n"));
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const steps = stepsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!name.trim() || steps.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const routine = await request<RoutineTemplate>("/routines", {
        method: "POST",
        body: JSON.stringify({ category, name: name.trim(), steps }),
      });
      setRoutines((prev) => [routine, ...prev]);
      setName("");
      setStepsText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add routine");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(routineId: string) {
    setPending(routineId);
    setError(null);
    try {
      await request(`/routines/${routineId}`, { method: "DELETE" });
      setRoutines((prev) => prev.filter((r) => r.routineId !== routineId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete routine");
    } finally {
      setPending(null);
    }
  }

  async function setStepStatus(routineId: string, stepIndex: number, status: RoutineStepLog["status"]) {
    const key = `${routineId}#${stepIndex}`;
    setPending(key);
    setError(null);
    try {
      const updated = await request<RoutineStepLog>(
        `/routine-logs/${today()}/${routineId}/${stepIndex}`,
        { method: "PATCH", body: JSON.stringify({ status }) },
      );
      setStepStatuses((prev) => ({ ...prev, [key]: updated.status }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update step");
    } finally {
      setPending(null);
    }
  }

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
              value={category}
              onChange={(e) => setCategory(e.target.value as RoutineCategory)}
              className={input}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
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
        <button type="submit" disabled={saving} className={`self-start ${primaryButton}`}>
          {saving ? "Adding..." : "Add routine"}
        </button>
      </form>

      {error && <p className={`mb-4 ${errorText}`}>{error}</p>}

      {loading ? (
        <p className={mutedText}>Loading...</p>
      ) : (
        <>
          <h2 className={`mb-2 ${sectionLabel}`}>Today's checklist ({today()})</h2>
          {routines.length === 0 ? (
            <p className={`mb-6 ${mutedText}`}>No routines yet — add one above.</p>
          ) : (
            <ul className="mb-6 flex flex-col gap-3">
              {routines.map((routine) => {
                const doneCount = routine.steps.filter(
                  (_, index) => stepStatuses[`${routine.routineId}#${index}`] === "done",
                ).length;
                return (
                <li key={routine.routineId} className={card}>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-ink dark:text-cream">
                      {routine.name}{" "}
                      <span className="font-normal text-ink-muted dark:text-fog-muted">
                        ({CATEGORY_LABEL[routine.category]})
                      </span>{" "}
                      <span className={badge}>
                        {doneCount}/{routine.steps.length} done
                      </span>
                    </p>
                    <button
                      type="button"
                      disabled={pending === routine.routineId}
                      onClick={() => handleDelete(routine.routineId)}
                      className={`${secondaryButton} px-2 py-1 text-xs`}
                    >
                      Delete
                    </button>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {routine.steps.map((step, index) => {
                      const key = `${routine.routineId}#${index}`;
                      const status = stepStatuses[key];
                      return (
                        <li key={key} className="flex items-center justify-between gap-3">
                          <span className="text-sm text-ink-muted dark:text-fog-muted">{step}</span>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              disabled={pending === key}
                              onClick={() => setStepStatus(routine.routineId, index, "done")}
                              className={`${pillButton} px-2.5 py-0.5 ${
                                status === "done" ? pillButtonDone : pillButtonInactive
                              }`}
                            >
                              Done
                            </button>
                            <button
                              type="button"
                              disabled={pending === key}
                              onClick={() => setStepStatus(routine.routineId, index, "skipped")}
                              className={`${pillButton} px-2.5 py-0.5 ${
                                status === "skipped" ? pillButtonSkipped : pillButtonInactive
                              }`}
                            >
                              Skipped
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
