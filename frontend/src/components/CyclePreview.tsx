import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../api/useApi";
import { todayLocal } from "../lib/date";
import { PHASE_INFO, computeAvgPeriodDays, estimatePhase, predictNextCycle } from "../lib/cyclePhase";
import type { LogEntry, UserProfile } from "../types";
import { sectionLabel } from "./ui";

// Hides itself entirely (returns null) when there isn't enough logged cycle history to
// estimate a phase, or when the user's profile says male — unlike Budget/Tasks/Insights,
// this card shouldn't clutter the dashboard for users who don't use the Cycle feature.
export default function CyclePreview() {
  const { request } = useApi();
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const [hide, setHide] = useState(false);

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
      } catch {
        // A quiet preview card — the full Cycle page is the source of truth.
      }
    }
    load();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!entries || hide) return null;

  const { avgCycleDays } = predictNextCycle(entries);
  const lastPeriodStart = entries
    .filter((e) => e.data.event === "period_start")
    .map((e) => e.date)
    .sort()
    .at(-1);

  if (avgCycleDays === null || !lastPeriodStart) return null;

  const avgPeriodDays = computeAvgPeriodDays(entries) ?? 5;
  const { phase, cycleDay } = estimatePhase(todayLocal(), lastPeriodStart, avgCycleDays, avgPeriodDays);
  const info = PHASE_INFO[phase];

  return (
    <div className={`flex-1 overflow-hidden rounded-2xl border border-stone shadow-sm dark:border-stone-dark ${info.badge}`}>
      <div className="p-6">
        <h2 className={`mb-2 ${sectionLabel} opacity-80`}>🌸 Cycle</h2>
        <p className="font-display text-lg font-medium">
          {info.emoji} {phase}
        </p>
        <p className="mt-0.5 text-xs opacity-80">
          Cycle day {cycleDay} of ~{avgCycleDays}
        </p>
        <Link to="/cycle" className="mt-2 inline-block text-xs underline">
          View cycle →
        </Link>
      </div>
    </div>
  );
}
