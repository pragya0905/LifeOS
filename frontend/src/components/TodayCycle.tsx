import { useState } from "react";
import { Link } from "react-router-dom";
import { todayLocal } from "../lib/date";
import { PHASE_INFO, computeAvgPeriodDays, estimatePhase, predictNextCycle } from "../lib/cyclePhase";
import type { LogEntry } from "../types";
import { Skeleton } from "./Skeleton";
import { card, errorText, input, mutedText, pillButton, pillButtonDone, pillButtonInactive, sectionLabel } from "./ui";

// `entries` is the full (unfiltered) cycle-log history and `onLogEvent` is Dashboard's own
// mutation — both owned by Dashboard.tsx's single wave-2 fetch/cache instead of this
// component independently re-fetching the same `/logs?logType=cycle` + `/profile` data
// Dashboard already has (that duplicate fetch was the whole reason for this refactor).
export default function TodayCycle({
  date,
  entries,
  onLogEvent,
}: {
  date: string;
  entries: LogEntry[] | null;
  onLogEvent: (eventType: "period_start" | "period_end" | "symptom", note?: string) => Promise<LogEntry | undefined>;
}) {
  const isToday = date === todayLocal();
  const [symptomNote, setSymptomNote] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function logEvent(eventType: "period_start" | "period_end" | "symptom", note?: string) {
    setSaving(eventType);
    setError(null);
    try {
      const entry = await onLogEvent(eventType, note);
      if (!entry) {
        setError("Failed to save cycle entry");
        return;
      }
      if (eventType === "symptom") setSymptomNote("");
    } finally {
      setSaving(null);
    }
  }

  if (!entries) {
    return (
      <div className={card}>
        <h2 className={`mb-2 ${sectionLabel}`}>{isToday ? "🌸 Today's cycle" : `🌸 Cycle (${date})`}</h2>
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  const loggedOnDate = {
    period_start: entries.some((e) => e.date === date && e.data.event === "period_start"),
    period_end: entries.some((e) => e.date === date && e.data.event === "period_end"),
    symptom: entries.some((e) => e.date === date && e.data.event === "symptom"),
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
    ? estimatePhase(date, lastPeriodStart as string, avgCycleDays as number, avgPeriodDays)
    : null;
  const info = estimate ? PHASE_INFO[estimate.phase] : null;

  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className={sectionLabel}>{isToday ? "🌸 Today's cycle" : `🌸 Cycle (${date})`}</h2>
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
          disabled={saving !== null || loggedOnDate.period_start}
          onClick={() => void logEvent("period_start")}
          className={`${pillButton} px-2.5 py-1 ${loggedOnDate.period_start ? pillButtonDone : pillButtonInactive}`}
        >
          {loggedOnDate.period_start ? "✓ Period started" : isToday ? "🩸 Period started today" : `🩸 Period started on ${date}`}
        </button>
        <button
          type="button"
          disabled={saving !== null || loggedOnDate.period_end}
          onClick={() => void logEvent("period_end")}
          className={`${pillButton} px-2.5 py-1 ${loggedOnDate.period_end ? pillButtonDone : pillButtonInactive}`}
        >
          {loggedOnDate.period_end ? "✓ Period ended" : isToday ? "◻️ Period ended today" : `◻️ Period ended on ${date}`}
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
          onClick={() => void logEvent("symptom", symptomNote.trim())}
          className={`${pillButton} ${pillButtonInactive} px-2.5 py-1`}
        >
          🌡️ Log
        </button>
      </div>
      {loggedOnDate.symptom && (
        <p className={`mt-1 text-xs ${mutedText}`}>
          {isToday ? "A symptom is already logged today." : `A symptom is already logged on ${date}.`}
        </p>
      )}
    </div>
  );
}
