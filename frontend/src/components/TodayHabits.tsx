import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../api/useApi";
import type { HabitLog, JournalEntry, LogEntry } from "../types";
import { card, errorText, input, mutedText, primaryButton, sectionLabel } from "./ui";

function today(): string {
  return new Date().toISOString().slice(0, 10);
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

export default function TodayHabits() {
  const { request } = useApi();
  const date = today();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [habitsData, sleepData, callData, journalData] = await Promise.all([
          request<{ habits: HabitLog[] }>(`/habits/${date}`),
          request<{ entries: LogEntry[] }>(`/logs?logType=sleep&from=${date}&to=${date}`),
          request<{ entries: LogEntry[] }>(`/logs?logType=call&from=${date}&to=${date}`),
          request<{ entries: JournalEntry[] }>(`/journal?from=${date}&to=${date}`),
        ]);
        if (ignore) return;

        for (const habit of habitsData.habits) {
          const value = String(habit.value ?? "");
          if (habit.habitType === "water") setWaterDraft(value);
          if (habit.habitType === "exercise") setExerciseDraft(value);
          if (habit.habitType === "meditation") setMeditationDraft(value);
        }

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
    setSaving(true);
    setError(null);
    try {
      const tasks: Promise<unknown>[] = [];

      if (waterDraft.trim() !== "") {
        tasks.push(
          request(`/habits/${date}/water`, {
            method: "PATCH",
            body: JSON.stringify({ value: Number(waterDraft) }),
          }),
        );
      }
      if (exerciseDraft.trim() !== "") {
        tasks.push(
          request(`/habits/${date}/exercise`, {
            method: "PATCH",
            body: JSON.stringify({ value: Number(exerciseDraft) }),
          }),
        );
      }
      if (meditationDraft.trim() !== "") {
        tasks.push(
          request(`/habits/${date}/meditation`, {
            method: "PATCH",
            body: JSON.stringify({ value: Number(meditationDraft) }),
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
          durationMinutes: callDuration ? Number(callDuration) : undefined,
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save habits");
    } finally {
      setSaving(false);
    }
  }

  const sleepDuration = computeSleepDuration(bedTime, wakeTime);

  const rowLabelClass = "px-3 py-3 text-sm font-medium text-ink dark:text-cream";
  const detailCellClass = "px-3 py-3";

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
                  </td>
                </tr>
                <tr className="border-b border-stone/40 dark:border-stone-dark/40">
                  <td className={rowLabelClass}>Exercise</td>
                  <td className={detailCellClass}>
                    <DoneCheck done={Number(exerciseDraft) > 0} />
                  </td>
                  <td className={detailCellClass}>
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
                    </div>
                  </td>
                </tr>
                <tr className="border-b border-stone/40 dark:border-stone-dark/40">
                  <td className={rowLabelClass}>Meditation</td>
                  <td className={detailCellClass}>
                    <DoneCheck done={Number(meditationDraft) > 0} />
                  </td>
                  <td className={detailCellClass}>
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
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveAll}
            className={`mt-4 ${primaryButton}`}
          >
            {saving ? "Saving..." : "Save habits"}
          </button>
        </>
      )}
    </div>
  );
}
