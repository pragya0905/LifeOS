import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../api/useApi";
import type { RoutineCategory, RoutineStepLog, RoutineTemplate } from "../types";

const CATEGORY_LABEL: Record<RoutineCategory, string> = {
  skinCare: "Skin care",
  hairCare: "Hair care",
  dailyRoutine: "Daily routine",
  custom: "Custom",
};

const CATEGORIES = Object.keys(CATEGORY_LABEL) as RoutineCategory[];

function today(): string {
  return new Date().toISOString().slice(0, 10);
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
    <div className="mx-auto mt-8 w-full max-w-2xl px-4">
      <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">Routines</h1>

      <form
        onSubmit={handleAdd}
        className="mb-8 flex flex-col gap-3 rounded-md border border-gray-200 p-4 dark:border-gray-700"
      >
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as RoutineCategory)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Morning skin care"
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            Steps (one per line)
          </label>
          <textarea
            required
            rows={4}
            value={stepsText}
            onChange={(e) => setStepsText(e.target.value)}
            placeholder={"Cleanser\nToner\nMoisturizer"}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="self-start rounded-md bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? "Adding..." : "Add routine"}
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <>
          <h2 className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">
            Today's checklist ({today()})
          </h2>
          {routines.length === 0 ? (
            <p className="mb-6 text-sm text-gray-500">No routines yet — add one above.</p>
          ) : (
            <ul className="mb-6 flex flex-col gap-3">
              {routines.map((routine) => (
                <li
                  key={routine.routineId}
                  className="rounded-md border border-gray-200 p-3 dark:border-gray-700"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {routine.name}{" "}
                      <span className="font-normal text-gray-500 dark:text-gray-400">
                        ({CATEGORY_LABEL[routine.category]})
                      </span>
                    </p>
                    <button
                      type="button"
                      disabled={pending === routine.routineId}
                      onClick={() => handleDelete(routine.routineId)}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
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
                          <span className="text-sm text-gray-700 dark:text-gray-300">{step}</span>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              disabled={pending === key}
                              onClick={() => setStepStatus(routine.routineId, index, "done")}
                              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium disabled:opacity-50 ${
                                status === "done"
                                  ? "border-green-600 bg-green-600 text-white"
                                  : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
                              }`}
                            >
                              Done
                            </button>
                            <button
                              type="button"
                              disabled={pending === key}
                              onClick={() => setStepStatus(routine.routineId, index, "skipped")}
                              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium disabled:opacity-50 ${
                                status === "skipped"
                                  ? "border-gray-500 bg-gray-500 text-white"
                                  : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
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
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
