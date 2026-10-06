import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../api/useApi";
import { todayLocal } from "../lib/date";
import { PHASE_INFO, computeAvgPeriodDays, estimatePhase, predictNextCycle } from "../lib/cyclePhase";
import type { LogEntry, UserProfile } from "../types";
import { Skeleton } from "./Skeleton";
import { card, errorText, input, mutedText, pillButton, pillButtonDone, pillButtonInactive, sectionLabel } from "./ui";

function today(): string {
  return todayLocal();
}

export default function TodayCycle() {
  const { request } = useApi();
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const [hide, setHide] = useState(false);
  const [symptomNote, setSymptomNote] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const [logsData, profile] = await Promise.all([
          request<{ entries: LogEntry[] }>("/logs?logType=cycle"),
          request<UserProfile>("/profile"),
        ]);
        if (ignore) return;
        setEntries(logsData.entries);
        setHide(profile.sex === "male");
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : "Failed to load cycle data");
      }
    }
    load();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logEvent(eventType: "period_start" | "period_end" | "symptom", note?: string) {
    setSaving(eventType);
    setError(null);
    try {
      const entry = await request<LogEntry>("/logs", {
        method: "POST",
        body: JSON.stringify({ logType: "cycle", date: today(), data: { event: eventType, note: note || undefined } }),
      });
      setEntries((prev) => [...(prev ?? []), entry]);
      if (eventType === "symptom") setSymptomNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save cycle entry");
    } finally {
      setSaving(null);
    }
  }

  if (hide) return null;

  if (!entries) {
    return (
      <div className={card}>
        <h2 className={`mb-2 ${sectionLabel}`}>🌸 Today's cycle</h2>
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  const loggedToday = {
    period_start: entries.some((e) => e.date === today() && e.data.event === "period_start"),
    period_end: entries.some((e) => e.date === today() && e.data.event === "period_end"),
    symptom: entries.some((e) => e.date === today() && e.data.event === "symptom"),
  };

  const { avgCycleDays, nextPredicted } = predictNextCycle(entries);
  const lastPeriodStart = entries
    .filter((e) => e.data.event === "period_start")
    .map((e) => e.date)
    .sort()
    .at(-1);

  const hasPhaseEstimate = avgCycleDays !== null && Boolean(lastPeriodStart);
  const avgPeriodDays = computeAvgPeriodDays(entries) ?? 5;
  const estimate = hasPhaseEstimate
    ? estimatePhase(today(), lastPeriodStart as string, avgCycleDays as number, avgPeriodDays)
    : null;
  const info = estimate ? PHASE_INFO[estimate.phase] : null;

  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className={sectionLabel}>🌸 Today's cycle</h2>
        <Link to="/cycle" className="text-xs text-bloom hover:underline">
          Manage →
        </Link>
      </div>

      {error && <p className={`mb-2 ${errorText}`}>{error}</p>}

      {estimate && info ? (
        <div className={`mb-3 rounded-xl px-3 py-2 ${info.badge}`}>
          <p className="font-display text-base font-medium">
            {info.emoji} {estimate.phase}
            {estimate.isFertile && <span className="ml-1.5 text-xs opacity-80">(fertile window)</span>}
          </p>
          <p className="mt-0.5 text-xs opacity-80">
            Cycle day {estimate.cycleDay} of ~{avgCycleDays}
            {nextPredicted && <> · next period expected {nextPredicted}</>}
          </p>
        </div>
      ) : (
        <p className={`mb-3 ${mutedText}`}>
          {entries.length === 0
            ? "Log your period start to begin tracking."
            : "Not enough history yet for a phase estimate — keep logging."}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={saving !== null || loggedToday.period_start}
          onClick={() => logEvent("period_start")}
          className={`${pillButton} px-2.5 py-1 ${loggedToday.period_start ? pillButtonDone : pillButtonInactive}`}
        >
          {loggedToday.period_start ? "✓ Period started" : "🩸 Period started today"}
        </button>
        <button
          type="button"
          disabled={saving !== null || loggedToday.period_end}
          onClick={() => logEvent("period_end")}
          className={`${pillButton} px-2.5 py-1 ${loggedToday.period_end ? pillButtonDone : pillButtonInactive}`}
        >
          {loggedToday.period_end ? "✓ Period ended" : "◻️ Period ended today"}
        </button>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <input
          type="text"
          value={symptomNote}
          onChange={(e) => setSymptomNote(e.target.value)}
          placeholder="Log a symptom (e.g. cramps)"
          className={`flex-1 py-1 text-xs ${input}`}
        />
        <button
          type="button"
          disabled={saving !== null || !symptomNote.trim()}
          onClick={() => logEvent("symptom", symptomNote.trim())}
          className={`${pillButton} ${pillButtonInactive} px-2.5 py-1`}
        >
          🌡️ Log
        </button>
      </div>
      {loggedToday.symptom && <p className={`mt-1 text-xs ${mutedText}`}>A symptom is already logged today.</p>}
    </div>
  );
}
