import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../api/useApi";
import type { Goal, GoalMetric, HabitLog, JournalEntry, LogEntry } from "../types";
import { card, errorText, input, mutedText, primaryButton, sectionLabel } from "./ui";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Returns the parsed number if valid, null if the draft is blank (field not being
// submitted), or NaN if the draft has content but isn't a valid non-negative number.
function parseNonNegative(draft: string): number | null {
  if (draft.trim() === "") return null;
  const n = Number(draft);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

function computeSleepDuration(bedTime: string, wakeTime: string): string | null {
  if (!bedTime || !wakeTime) return null;
  const [bh, bm] = bedTime.split(":").map(Number);
  const [wh, wm] = wakeTime.split(":").map(Number);
  if ([bh, bm, wh, wm].some(Number.isNaN)) return null;
  let minutes = wh * 60 + wm - (bh * 60 + bm);
  if (minutes <= 0) minutes += 24 * 60;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// Defined at module scope (not nested inside TodayHabits) so React keeps the same
// element identity across re-renders — nesting these would remount the <input> on
// every keystroke and silently drop focus before onBlur can fire.
function DoneCheck({ done }: { done: boolean }) {
  return (
    <input
      type="checkbox"
      checked={done}
      readOnly
      disabled
      className="h-4 w-4 rounded border-stone text-sage accent-sage disabled:opacity-100 dark:border-stone-dark"
    />
  );
}

function GoalTarget({
  value,
  onChange,
  onBlur,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  disabled: boolean;
}) {
  return (
    <span className={`flex items-center gap-1 ${mutedText}`}>
      goal
      <input
        type="number"
        min={1}
        placeholder="target"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        className={`w-20 py-0.5 text-xs ${input}`}
      />
    </span>
  );
}

export default function TodayHabits() {
  const { request } = useApi();
  const date = today();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<"water" | "exercise" | "meditation" | "callDuration", string>>
  >({});

  const [waterDraft, setWaterDraft] = useState("");
  const [exerciseDraft, setExerciseDraft] = useState("");
  const [meditationDraft, setMeditationDraft] = useState("");

  const [sleepLogId, setSleepLogId] = useState<string | null>(null);
  const [bedTime, setBedTime] = useState("");
  const [wakeTime, setWakeTime] = useState("");

  const [callLogId, setCallLogId] = useState<string | null>(null);
  const [callPerson, setCallPerson] = useState("");
  const [callDuration, setCallDuration] = useState("");

  const [journaledToday, setJournaledToday] = useState(false);

  const [goalDrafts, setGoalDrafts] = useState<Partial<Record<GoalMetric, string>>>({});
  const [savingGoal, setSavingGoal] = useState<GoalMetric | null>(null);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [habitsData, sleepData, callData, journalData, goalsData] = await Promise.all([
          request<{ habits: HabitLog[] }>(`/habits/${date}`),
          request<{ entries: LogEntry[] }>(`/logs?logType=sleep&from=${date}&to=${date}`),
          request<{ entries: LogEntry[] }>(`/logs?logType=call&from=${date}&to=${date}`),
          request<{ entries: JournalEntry[] }>(`/journal?from=${date}&to=${date}`),
          request<{ goals: Goal[] }>("/goals"),
        ]);
        if (ignore) return;

        for (const habit of habitsData.habits) {
          const value = String(habit.value ?? "");
          if (habit.habitType === "water") setWaterDraft(value);
          if (habit.habitType === "exercise") setExerciseDraft(value);
          if (habit.habitType === "meditation") setMeditationDraft(value);
        }

        const goalDraftsNext: Partial<Record<GoalMetric, string>> = {};
        for (const goal of goalsData.goals) goalDraftsNext[goal.metric] = String(goal.targetValue);
        setGoalDrafts(goalDraftsNext);

        const sleep = sleepData.entries[0];
        if (sleep) {
          setSleepLogId(sleep.logId);
          setBedTime((sleep.data.bedTime as string) ?? "");
          setWakeTime((sleep.data.wakeTime as string) ?? "");
        }

        const call = callData.entries[0];
        if (call) {
          setCallLogId(call.logId);
          setCallPerson((call.data.personName as string) ?? "");
          setCallDuration(
            call.data.durationMinutes !== undefined ? String(call.data.durationMinutes) : "",
          );
        }

        setJournaledToday(journalData.entries.length > 0);
      } catch (err) {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Failed to load today's habits");
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

  async function handleSaveAll() {
    setError(null);
    setSaved(false);

    const water = parseNonNegative(waterDraft);
    const exercise = parseNonNegative(exerciseDraft);
    const meditation = parseNonNegative(meditationDraft);
    const duration = parseNonNegative(callDuration);

    const nextFieldErrors: typeof fieldErrors = {};
    if (Number.isNaN(water)) nextFieldErrors.water = "Enter a non-negative number";
    if (Number.isNaN(exercise)) nextFieldErrors.exercise = "Enter a non-negative number";
    if (Number.isNaN(meditation)) nextFieldErrors.meditation = "Enter a non-negative number";
    if (Number.isNaN(duration)) nextFieldErrors.callDuration = "Enter a non-negative number";
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;

    setSaving(true);
    try {
      const tasks: Promise<unknown>[] = [];

      if (water !== null) {
        tasks.push(
          request(`/habits/${date}/water`, {
            method: "PATCH",
            body: JSON.stringify({ value: water }),
          }),
        );
      }
      if (exercise !== null) {
        tasks.push(
          request(`/habits/${date}/exercise`, {
            method: "PATCH",
            body: JSON.stringify({ value: exercise }),
          }),
        );
      }
      if (meditation !== null) {
        tasks.push(
          request(`/habits/${date}/meditation`, {
            method: "PATCH",
            body: JSON.stringify({ value: meditation }),
          }),
        );
      }
      if (bedTime && wakeTime) {
        const data = { bedTime, wakeTime };
        tasks.push(
          sleepLogId
            ? request(`/logs/${sleepLogId}`, { method: "PATCH", body: JSON.stringify({ data }) })
            : request("/logs", {
                method: "POST",
                body: JSON.stringify({ logType: "sleep", date, data }),
              }),
        );
      }
      if (callPerson.trim() !== "") {
        const data = {
          personName: callPerson.trim(),
          durationMinutes: duration ?? undefined,
        };
        tasks.push(
          callLogId
            ? request(`/logs/${callLogId}`, { method: "PATCH", body: JSON.stringify({ data }) })
            : request("/logs", {
                method: "POST",
                body: JSON.stringify({ logType: "call", date, data }),
              }),
        );
      }

      await Promise.all(tasks);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save habits");
    } finally {
      setSaving(false);
    }
  }

  async function saveGoal(metric: GoalMetric) {
    const draft = goalDrafts[metric] ?? "";
    const parsed = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(parsed) || parsed <= 0) return;
    setSavingGoal(metric);
    try {
      await request(`/goals/${metric}`, {
        method: "PATCH",
        body: JSON.stringify({ targetValue: parsed }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save goal");
    } finally {
      setSavingGoal(null);
    }
  }

  const sleepDuration = computeSleepDuration(bedTime, wakeTime);

  const rowLabelClass = "px-3 py-3 text-sm font-medium text-ink dark:text-cream";
  const detailCellClass = "px-3 py-3";

  function updateGoalDraft(metric: GoalMetric, value: string) {
    setGoalDrafts((prev) => ({ ...prev, [metric]: value }));
  }

  return (
    <div className={card}>
      <h2 className={`mb-3 ${sectionLabel}`}>Today's habits ({date})</h2>
      {error && <p className={`mb-2 ${errorText}`}>{error}</p>}
      {loading ? (
        <p className={mutedText}>Loading...</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead>
                <tr className="border-b border-stone/60 dark:border-stone-dark/60">
                  <th className={`${rowLabelClass} font-normal ${mutedText}`}>Habit</th>
                  <th className={`${detailCellClass} font-normal ${mutedText}`}>Done</th>
                  <th className={`${detailCellClass} font-normal ${mutedText}`}>Details</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-stone/40 dark:border-stone-dark/40">
                  <td className={rowLabelClass}>Water</td>
                  <td className={detailCellClass}>
                    <DoneCheck done={Number(waterDraft) > 0} />
                  </td>
                  <td className={detailCellClass}>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          placeholder="0"
                          value={waterDraft}
                          onChange={(e) => setWaterDraft(e.target.value)}
                          className={`w-24 py-1 ${input}`}
                        />
                        <span className={mutedText}>ml</span>
                        <GoalTarget
                          value={goalDrafts.water ?? ""}
                          onChange={(v) => updateGoalDraft("water", v)}
                          onBlur={() => saveGoal("water")}
                          disabled={savingGoal === "water"}
                        />
                      </div>
                      {fieldErrors.water && <p className={errorText}>{fieldErrors.water}</p>}
                    </div>
                  </td>
                </tr>
                <tr className="border-b border-stone/40 dark:border-stone-dark/40">
                  <td className={rowLabelClass}>Sleep</td>
                  <td className={detailCellClass}>
                    <DoneCheck done={Boolean(bedTime && wakeTime)} />
                  </td>
                  <td className={detailCellClass}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={mutedText}>From</span>
                      <input
                        type="time"
                        value={bedTime}
                        onChange={(e) => setBedTime(e.target.value)}
                        className={`py-1 ${input}`}
                      />
                      <span className={mutedText}>To</span>
                      <input
                        type="time"
                        value={wakeTime}
                        onChange={(e) => setWakeTime(e.target.value)}
                        className={`py-1 ${input}`}
                      />
                      {sleepDuration && <span className={mutedText}>({sleepDuration})</span>}
                    </div>
                  </td>
                </tr>
                <tr className="border-b border-stone/40 dark:border-stone-dark/40">
                  <td className={rowLabelClass}>Call</td>
                  <td className={detailCellClass}>
                    <DoneCheck done={callPerson.trim() !== ""} />
                  </td>
                  <td className={detailCellClass}>
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={mutedText}>with</span>
                        <input
                          type="text"
                          placeholder="Name"
                          value={callPerson}
                          onChange={(e) => setCallPerson(e.target.value)}
                          className={`w-28 py-1 ${input}`}
                        />
                        <input
                          type="number"
                          min={0}
                          placeholder="0"
                          value={callDuration}
                          onChange={(e) => setCallDuration(e.target.value)}
                          className={`w-20 py-1 ${input}`}
                        />
                        <span className={mutedText}>min</span>
                      </div>
                      {fieldErrors.callDuration && (
                        <p className={errorText}>{fieldErrors.callDuration}</p>
                      )}
                    </div>
                  </td>
                </tr>
                <tr className="border-b border-stone/40 dark:border-stone-dark/40">
                  <td className={rowLabelClass}>Exercise</td>
                  <td className={detailCellClass}>
                    <DoneCheck done={Number(exerciseDraft) > 0} />
                  </td>
                  <td className={detailCellClass}>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          placeholder="0"
                          value={exerciseDraft}
                          onChange={(e) => setExerciseDraft(e.target.value)}
                          className={`w-24 py-1 ${input}`}
                        />
                        <span className={mutedText}>minutes</span>
                        <GoalTarget
                          value={goalDrafts.exercise ?? ""}
                          onChange={(v) => updateGoalDraft("exercise", v)}
                          onBlur={() => saveGoal("exercise")}
                          disabled={savingGoal === "exercise"}
                        />
                      </div>
                      {fieldErrors.exercise && <p className={errorText}>{fieldErrors.exercise}</p>}
                    </div>
                  </td>
                </tr>
                <tr className="border-b border-stone/40 dark:border-stone-dark/40">
                  <td className={rowLabelClass}>Meditation</td>
                  <td className={detailCellClass}>
                    <DoneCheck done={Number(meditationDraft) > 0} />
                  </td>
                  <td className={detailCellClass}>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          placeholder="0"
                          value={meditationDraft}
                          onChange={(e) => setMeditationDraft(e.target.value)}
                          className={`w-24 py-1 ${input}`}
                        />
                        <span className={mutedText}>minutes</span>
                        <GoalTarget
                          value={goalDrafts.meditation ?? ""}
                          onChange={(v) => updateGoalDraft("meditation", v)}
                          onBlur={() => saveGoal("meditation")}
                          disabled={savingGoal === "meditation"}
                        />
                      </div>
                      {fieldErrors.meditation && (
                        <p className={errorText}>{fieldErrors.meditation}</p>
                      )}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td className={rowLabelClass}>Journal</td>
                  <td className={detailCellClass}>
                    <DoneCheck done={journaledToday} />
                  </td>
                  <td className={detailCellClass}>
                    <Link to="/journal" className="text-sm text-sage hover:underline">
                      {journaledToday ? "View today's entry" : "Write today's entry"} →
                    </Link>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveAll}
              className={primaryButton}
            >
              {saving ? "Saving..." : "Save habits"}
            </button>
            {saved && <span className="text-sm text-sage">Saved ✓</span>}
          </div>
        </>
      )}
    </div>
  );
}
