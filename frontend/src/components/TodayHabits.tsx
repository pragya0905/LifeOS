import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../api/useApi";
import { toLocalDateStr, todayLocal } from "../lib/date";
import type { Goal, GoalMetric, HabitLog, JournalEntry, LogEntry } from "../types";
import {
  badge,
  card,
  errorText,
  input,
  mutedText,
  pillButton,
  pillButtonInactive,
  primaryButton,
  secondaryButton,
  sectionLabel,
} from "./ui";

const OLDEST_DAYS_AGO = 7; // "past 8 days" = today + 7 prior days = 8 selectable days total

function today(): string {
  return todayLocal();
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return toLocalDateStr(d);
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
function DoneCheck({ done, label }: { done: boolean; label: string }) {
  return (
    <input
      type="checkbox"
      checked={done}
      readOnly
      disabled
      aria-label={`${label}: ${done ? "done" : "not done"}`}
      className="h-4 w-4 rounded border-stone text-bloom accent-bloom disabled:opacity-100 dark:border-stone-dark"
    />
  );
}

function GoalTarget({
  value,
  onChange,
  onBlur,
  disabled,
  habitLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  disabled: boolean;
  habitLabel: string;
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
        aria-label={`${habitLabel} daily goal`}
        className={`w-20 py-0.5 text-xs ${input}`}
      />
    </span>
  );
}

export default function TodayHabits() {
  const { request } = useApi();
  const [selectedDate, setSelectedDate] = useState(today());
  const oldestAllowed = addDays(today(), -OLDEST_DAYS_AGO);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<"water" | "exercise" | "steps" | "callDuration" | "weight" | "bodyFat", string>>
  >({});

  const [waterDraft, setWaterDraft] = useState("");
  const [exerciseDraft, setExerciseDraft] = useState("");
  const [stepsDraft, setStepsDraft] = useState("");
  // Tracks whether each habit's current value came from journal AI extraction (vs a manual
  // save), so the UI can show where a number actually came from — the same "manual always
  // wins" precedence guarantee the backend enforces.
  const [habitSource, setHabitSource] = useState<
    Partial<Record<"water" | "exercise" | "steps", "manual" | "ai-journal">>
  >({});

  const [sleepLogId, setSleepLogId] = useState<string | null>(null);
  const [bedTime, setBedTime] = useState("");
  const [wakeTime, setWakeTime] = useState("");

  const [callLogId, setCallLogId] = useState<string | null>(null);
  const [callPerson, setCallPerson] = useState("");
  const [callDuration, setCallDuration] = useState("");

  const [weightLogId, setWeightLogId] = useState<string | null>(null);
  const [weightDraft, setWeightDraft] = useState("");

  const [bodyFatLogId, setBodyFatLogId] = useState<string | null>(null);
  const [bodyFatDraft, setBodyFatDraft] = useState("");

  const [moodLogId, setMoodLogId] = useState<string | null>(null);
  const [moodRating, setMoodRating] = useState<number | null>(null);
  const [moodNote, setMoodNote] = useState("");

  const [journaledThatDay, setJournaledThatDay] = useState(false);

  const [goalDrafts, setGoalDrafts] = useState<Partial<Record<GoalMetric, string>>>({});
  const [savingGoal, setSavingGoal] = useState<GoalMetric | null>(null);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      setError(null);
      // Reset every per-day field before fetching — otherwise switching to a date with no
      // sleep/call/weight/etc. entry would keep showing the previous date's values.
      setWaterDraft("");
      setExerciseDraft("");
      setStepsDraft("");
      setHabitSource({});
      setSleepLogId(null);
      setBedTime("");
      setWakeTime("");
      setCallLogId(null);
      setCallPerson("");
      setCallDuration("");
      setWeightLogId(null);
      setWeightDraft("");
      setBodyFatLogId(null);
      setBodyFatDraft("");
      setMoodLogId(null);
      setMoodRating(null);
      setMoodNote("");
      setJournaledThatDay(false);
      setFieldErrors({});
      try {
        const [habitsData, sleepData, callData, weightData, bodyFatData, moodData, journalData, goalsData] =
          await Promise.all([
            request<{ habits: HabitLog[] }>(`/habits/${selectedDate}`),
            request<{ entries: LogEntry[] }>(`/logs?logType=sleep&from=${selectedDate}&to=${selectedDate}`),
            request<{ entries: LogEntry[] }>(`/logs?logType=call&from=${selectedDate}&to=${selectedDate}`),
            request<{ entries: LogEntry[] }>(`/logs?logType=weight&from=${selectedDate}&to=${selectedDate}`),
            request<{ entries: LogEntry[] }>(`/logs?logType=bodyFat&from=${selectedDate}&to=${selectedDate}`),
            request<{ entries: LogEntry[] }>(`/logs?logType=mood&from=${selectedDate}&to=${selectedDate}`),
            request<{ entries: JournalEntry[] }>(`/journal?from=${selectedDate}&to=${selectedDate}`),
            request<{ goals: Goal[] }>("/goals"),
          ]);
        if (ignore) return;

        const sourceNext: typeof habitSource = {};
        for (const habit of habitsData.habits) {
          const value = String(habit.value ?? "");
          if (habit.habitType === "water") setWaterDraft(value);
          if (habit.habitType === "exercise") setExerciseDraft(value);
          if (habit.habitType === "steps") setStepsDraft(value);
          if (
            habit.habitType === "water" ||
            habit.habitType === "exercise" ||
            habit.habitType === "steps"
          ) {
            sourceNext[habit.habitType] = habit.source;
          }
        }
        setHabitSource(sourceNext);

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

        const weight = weightData.entries[0];
        if (weight) {
          setWeightLogId(weight.logId);
          setWeightDraft(weight.data.valueKg !== undefined ? String(weight.data.valueKg) : "");
        }

        const bodyFat = bodyFatData.entries[0];
        if (bodyFat) {
          setBodyFatLogId(bodyFat.logId);
          setBodyFatDraft(bodyFat.data.percentage !== undefined ? String(bodyFat.data.percentage) : "");
        }

        const mood = moodData.entries[0];
        if (mood) {
          setMoodLogId(mood.logId);
          setMoodRating(mood.data.rating !== undefined ? Number(mood.data.rating) : null);
          setMoodNote((mood.data.note as string) ?? "");
        }

        setJournaledThatDay(journalData.entries.length > 0);
      } catch (err) {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Failed to load habits");
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

  async function handleSaveAll() {
    setError(null);
    setSaved(false);

    const water = parseNonNegative(waterDraft);
    const exercise = parseNonNegative(exerciseDraft);
    const steps = parseNonNegative(stepsDraft);
    const duration = parseNonNegative(callDuration);
    const weight = parseNonNegative(weightDraft);
    const bodyFat = parseNonNegative(bodyFatDraft);

    const nextFieldErrors: typeof fieldErrors = {};
    if (Number.isNaN(water)) nextFieldErrors.water = "Enter a non-negative number";
    if (Number.isNaN(exercise)) nextFieldErrors.exercise = "Enter a non-negative number";
    if (Number.isNaN(steps)) nextFieldErrors.steps = "Enter a non-negative number";
    if (Number.isNaN(duration)) nextFieldErrors.callDuration = "Enter a non-negative number";
    if (Number.isNaN(weight)) nextFieldErrors.weight = "Enter a non-negative number";
    if (Number.isNaN(bodyFat)) nextFieldErrors.bodyFat = "Enter a non-negative number";
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;

    setSaving(true);
    try {
      const tasks: Promise<unknown>[] = [];

      if (water !== null) {
        tasks.push(
          request(`/habits/${selectedDate}/water`, {
            method: "PATCH",
            body: JSON.stringify({ value: water }),
          }),
        );
      }
      if (exercise !== null) {
        tasks.push(
          request(`/habits/${selectedDate}/exercise`, {
            method: "PATCH",
            body: JSON.stringify({ value: exercise }),
          }),
        );
      }
      if (steps !== null) {
        tasks.push(
          request(`/habits/${selectedDate}/steps`, {
            method: "PATCH",
            body: JSON.stringify({ value: steps }),
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
                body: JSON.stringify({ logType: "sleep", date: selectedDate, data }),
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
                body: JSON.stringify({ logType: "call", date: selectedDate, data }),
              }),
        );
      }
      if (weight !== null) {
        const data = { valueKg: weight };
        tasks.push(
          weightLogId
            ? request(`/logs/${weightLogId}`, { method: "PATCH", body: JSON.stringify({ data }) })
            : request("/logs", {
                method: "POST",
                body: JSON.stringify({ logType: "weight", date: selectedDate, data }),
              }),
        );
      }
      if (bodyFat !== null) {
        const data = { percentage: bodyFat };
        tasks.push(
          bodyFatLogId
            ? request(`/logs/${bodyFatLogId}`, { method: "PATCH", body: JSON.stringify({ data }) })
            : request("/logs", {
                method: "POST",
                body: JSON.stringify({ logType: "bodyFat", date: selectedDate, data }),
              }),
        );
      }
      if (moodRating !== null) {
        const data = { rating: moodRating, note: moodNote.trim() || undefined };
        tasks.push(
          moodLogId
            ? request(`/logs/${moodLogId}`, { method: "PATCH", body: JSON.stringify({ data }) })
            : request("/logs", {
                method: "POST",
                body: JSON.stringify({ logType: "mood", date: selectedDate, data }),
              }),
        );
      }
      await Promise.all(tasks);
      setHabitSource((prev) => {
        const next = { ...prev };
        if (water !== null) next.water = "manual";
        if (exercise !== null) next.exercise = "manual";
        if (steps !== null) next.steps = "manual";
        return next;
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save habits");
    } finally {
      setSaving(false);
    }
  }

  const [quickAdding, setQuickAdding] = useState(false);

  async function quickAddWater(amountMl: number) {
    const next = (Number(waterDraft) || 0) + amountMl;
    setQuickAdding(true);
    setError(null);
    try {
      await request(`/habits/${selectedDate}/water`, {
        method: "PATCH",
        body: JSON.stringify({ value: next }),
      });
      setWaterDraft(String(next));
      setHabitSource((prev) => ({ ...prev, water: "manual" }));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log water");
    } finally {
      setQuickAdding(false);
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
  const isToday = selectedDate === today();

  const rowLabelClass = "px-3 py-3 text-sm font-medium text-ink dark:text-paper";
  const detailCellClass = "px-3 py-3";

  function updateGoalDraft(metric: GoalMetric, value: string) {
    setGoalDrafts((prev) => ({ ...prev, [metric]: value }));
  }

  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setSelectedDate((d) => addDays(d, -1))}
          disabled={selectedDate <= oldestAllowed}
          className={`${secondaryButton} px-2 py-1 text-xs`}
        >
          ← Prev day
        </button>
        <h2 className={sectionLabel}>
          {isToday ? "Today's habits" : "Habits"} ({selectedDate})
        </h2>
        <button
          type="button"
          onClick={() => setSelectedDate((d) => addDays(d, 1))}
          disabled={isToday}
          className={`${secondaryButton} px-2 py-1 text-xs`}
        >
          Next day →
        </button>
      </div>
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
                    <DoneCheck done={Number(waterDraft) > 0} label="Water" />
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
                          aria-label="Water intake in milliliters"
                          className={`w-24 py-1 ${input}`}
                        />
                        <span className={mutedText}>ml</span>
                        {habitSource.water === "ai-journal" && (
                          <span className={badge} title="Populated from your journal entry">
                            from journal
                          </span>
                        )}
                        <GoalTarget
                          value={goalDrafts.water ?? ""}
                          onChange={(v) => updateGoalDraft("water", v)}
                          onBlur={() => saveGoal("water")}
                          disabled={savingGoal === "water"}
                          habitLabel="Water"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        {[250, 500].map((amount) => (
                          <button
                            key={amount}
                            type="button"
                            disabled={quickAdding}
                            onClick={() => quickAddWater(amount)}
                            className={`${pillButton} ${pillButtonInactive}`}
                          >
                            +{amount}ml
                          </button>
                        ))}
                      </div>
                      {fieldErrors.water && <p className={errorText}>{fieldErrors.water}</p>}
                    </div>
                  </td>
                </tr>
                <tr className="border-b border-stone/40 dark:border-stone-dark/40">
                  <td className={rowLabelClass}>Sleep</td>
                  <td className={detailCellClass}>
                    <DoneCheck done={Boolean(bedTime && wakeTime)} label="Sleep" />
                  </td>
                  <td className={detailCellClass}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={mutedText}>From</span>
                      <input
                        type="time"
                        value={bedTime}
                        onChange={(e) => setBedTime(e.target.value)}
                        aria-label="Sleep bed time"
                        className={`py-1 ${input}`}
                      />
                      <span className={mutedText}>To</span>
                      <input
                        type="time"
                        value={wakeTime}
                        onChange={(e) => setWakeTime(e.target.value)}
                        aria-label="Sleep wake time"
                        className={`py-1 ${input}`}
                      />
                      {sleepDuration && <span className={mutedText}>({sleepDuration})</span>}
                    </div>
                  </td>
                </tr>
                <tr className="border-b border-stone/40 dark:border-stone-dark/40">
                  <td className={rowLabelClass}>Call</td>
                  <td className={detailCellClass}>
                    <DoneCheck done={callPerson.trim() !== ""} label="Call" />
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
                          aria-label="Call: person's name"
                          className={`w-28 py-1 ${input}`}
                        />
                        <input
                          type="number"
                          min={0}
                          placeholder="0"
                          value={callDuration}
                          onChange={(e) => setCallDuration(e.target.value)}
                          aria-label="Call duration in minutes"
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
                    <DoneCheck done={Number(exerciseDraft) > 0} label="Exercise" />
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
                          aria-label="Exercise duration in minutes"
                          className={`w-24 py-1 ${input}`}
                        />
                        <span className={mutedText}>minutes</span>
                        {habitSource.exercise === "ai-journal" && (
                          <span className={badge} title="Populated from your journal entry">
                            from journal
                          </span>
                        )}
                        <GoalTarget
                          value={goalDrafts.exercise ?? ""}
                          onChange={(v) => updateGoalDraft("exercise", v)}
                          onBlur={() => saveGoal("exercise")}
                          disabled={savingGoal === "exercise"}
                          habitLabel="Exercise"
                        />
                      </div>
                      {fieldErrors.exercise && <p className={errorText}>{fieldErrors.exercise}</p>}
                    </div>
                  </td>
                </tr>
                <tr className="border-b border-stone/40 dark:border-stone-dark/40">
                  <td className={rowLabelClass}>Steps</td>
                  <td className={detailCellClass}>
                    <DoneCheck done={Number(stepsDraft) > 0} label="Steps" />
                  </td>
                  <td className={detailCellClass}>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          placeholder="0"
                          value={stepsDraft}
                          onChange={(e) => setStepsDraft(e.target.value)}
                          aria-label="Step count"
                          className={`w-24 py-1 ${input}`}
                        />
                        <span className={mutedText}>steps</span>
                        {habitSource.steps === "ai-journal" && (
                          <span className={badge} title="Populated from your journal entry">
                            from journal
                          </span>
                        )}
                        <GoalTarget
                          value={goalDrafts.steps ?? ""}
                          onChange={(v) => updateGoalDraft("steps", v)}
                          onBlur={() => saveGoal("steps")}
                          disabled={savingGoal === "steps"}
                          habitLabel="Steps"
                        />
                      </div>
                      {fieldErrors.steps && (
                        <p className={errorText}>{fieldErrors.steps}</p>
                      )}
                    </div>
                  </td>
                </tr>
                <tr className="border-b border-stone/40 dark:border-stone-dark/40">
                  <td className={rowLabelClass}>Weight</td>
                  <td className={detailCellClass}>
                    <DoneCheck done={weightDraft.trim() !== ""} label="Weight" />
                  </td>
                  <td className={detailCellClass}>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          step="0.1"
                          placeholder="0"
                          value={weightDraft}
                          onChange={(e) => setWeightDraft(e.target.value)}
                          aria-label="Weight in kilograms"
                          className={`w-24 py-1 ${input}`}
                        />
                        <span className={mutedText}>kg</span>
                      </div>
                      {fieldErrors.weight && <p className={errorText}>{fieldErrors.weight}</p>}
                    </div>
                  </td>
                </tr>
                <tr className="border-b border-stone/40 dark:border-stone-dark/40">
                  <td className={rowLabelClass}>Body fat %</td>
                  <td className={detailCellClass}>
                    <DoneCheck done={bodyFatDraft.trim() !== ""} label="Body fat percentage" />
                  </td>
                  <td className={detailCellClass}>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.1"
                          placeholder="0"
                          value={bodyFatDraft}
                          onChange={(e) => setBodyFatDraft(e.target.value)}
                          aria-label="Body fat percentage"
                          className={`w-24 py-1 ${input}`}
                        />
                        <span className={mutedText}>%</span>
                      </div>
                      {fieldErrors.bodyFat && <p className={errorText}>{fieldErrors.bodyFat}</p>}
                    </div>
                  </td>
                </tr>
                <tr className="border-b border-stone/40 dark:border-stone-dark/40">
                  <td className={rowLabelClass}>Mood</td>
                  <td className={detailCellClass}>
                    <DoneCheck done={moodRating !== null} label="Mood" />
                  </td>
                  <td className={detailCellClass}>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setMoodRating(n)}
                            aria-label={`Mood rating ${n}`}
                            aria-pressed={moodRating === n}
                            className={`${pillButton} h-7 w-7 justify-center p-0 ${
                              moodRating === n ? "border-bloom bg-bloom text-paper-card" : pillButtonInactive
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        placeholder="Note (optional)"
                        value={moodNote}
                        onChange={(e) => setMoodNote(e.target.value)}
                        aria-label="Mood note"
                        className={`w-full max-w-[220px] py-1 ${input}`}
                      />
                    </div>
                  </td>
                </tr>
                <tr>
                  <td className={rowLabelClass}>Journal</td>
                  <td className={detailCellClass}>
                    <DoneCheck done={journaledThatDay} label="Journal" />
                  </td>
                  <td className={detailCellClass}>
                    <Link to="/journal" className="text-sm text-bloom hover:underline">
                      {journaledThatDay
                        ? isToday
                          ? "View today's entry"
                          : `View entry for ${selectedDate}`
                        : isToday
                          ? "Write today's entry"
                          : `Write entry for ${selectedDate}`}{" "}
                      →
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
            {saved && <span className="text-sm text-bloom">Saved ✓</span>}
          </div>
        </>
      )}
    </div>
  );
}
