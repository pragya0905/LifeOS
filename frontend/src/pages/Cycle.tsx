import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../api/useApi";
import { todayLocal } from "../lib/date";
import type { LogEntry } from "../types";
import {
  badge,
  card,
  errorText,
  input,
  label,
  mutedText,
  page,
  pageTitle,
  primaryButton,
  secondaryButton,
  sectionLabel,
} from "../components/ui";

const INTRO_DISMISSED_KEY = "lifeos-cycle-intro-dismissed";

type CycleEvent = "period_start" | "period_end" | "symptom";

const EVENT_LABEL: Record<CycleEvent, string> = {
  period_start: "🩸 Period start",
  period_end: "◻️ Period end",
  symptom: "🌡️ Symptom",
};

const EVENT_BADGE: Record<CycleEvent, string> = {
  period_start: "bg-alert-soft text-alert dark:bg-alert-soft-dark dark:text-alert-light",
  period_end: "bg-stone text-ink-muted dark:bg-stone-dark dark:text-mist-muted",
  symptom: "bg-amber-soft text-amber-ink dark:bg-amber-soft-dark dark:text-amber-ink-dark",
};

function today(): string {
  return todayLocal();
}

function daysBetween(a: string, b: string): number {
  const d1 = new Date(`${a}T00:00:00Z`);
  const d2 = new Date(`${b}T00:00:00Z`);
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

function predictNextCycle(entries: LogEntry[]): { avgCycleDays: number | null; nextPredicted: string | null } {
  const starts = entries
    .filter((e) => e.data.event === "period_start")
    .map((e) => e.date)
    .sort();
  if (starts.length < 2) return { avgCycleDays: null, nextPredicted: null };

  const gaps: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    gaps.push(daysBetween(starts[i - 1], starts[i]));
  }
  const avgCycleDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);

  const last = new Date(`${starts[starts.length - 1]}T00:00:00Z`);
  last.setUTCDate(last.getUTCDate() + avgCycleDays);

  return { avgCycleDays, nextPredicted: last.toISOString().slice(0, 10) };
}

// Pairs each period_start with the next period_end on or after it — a best-effort match,
// not a strict one-to-one, since a day with no matching end just doesn't contribute a length.
function computeAvgPeriodDays(entries: LogEntry[]): number | null {
  const starts = entries.filter((e) => e.data.event === "period_start").map((e) => e.date).sort();
  const ends = entries.filter((e) => e.data.event === "period_end").map((e) => e.date).sort();
  const lengths: number[] = [];
  for (const start of starts) {
    const end = ends.find((e) => e >= start);
    if (end) lengths.push(daysBetween(start, end) + 1);
  }
  if (lengths.length === 0) return null;
  return Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
}

type Phase = "Menstrual" | "Follicular" | "Ovulation" | "Luteal";

const PHASE_INFO: Record<Phase, { emoji: string; description: string; badge: string; bar: string }> = {
  Menstrual: {
    emoji: "🩸",
    description: "Your period. Energy is often lower here — a natural stretch to take it easier.",
    badge: "bg-alert-soft text-alert dark:bg-alert-soft-dark dark:text-alert-light",
    bar: "bg-alert",
  },
  Follicular: {
    emoji: "🌱",
    description: "Between your period and ovulation. Energy and mood tend to rise through this stretch.",
    badge: "bg-stone text-ink-muted dark:bg-stone-dark dark:text-mist-muted",
    bar: "bg-stone-dark dark:bg-mist-muted",
  },
  Ovulation: {
    emoji: "🥚",
    description: "Your estimated fertile window — ovulation is expected around now.",
    badge: "bg-amber-soft text-amber-ink dark:bg-amber-soft-dark dark:text-amber-ink-dark",
    bar: "bg-amber",
  },
  Luteal: {
    emoji: "🌙",
    description: "After ovulation. PMS-type symptoms (mood, cramps, fatigue) are more common later in this phase.",
    badge: "bg-bloom-soft text-bloom dark:bg-bloom-soft-dark dark:text-bloom-light",
    bar: "bg-bloom",
  },
};

// Standard cycle-phase estimation (the same math apps like Clue use): the luteal phase is
// usually a fairly fixed ~14 days regardless of cycle length, so ovulation is estimated by
// counting back 14 days from the *next* predicted period rather than forward from this one —
// this is an estimate assuming your logged cycles are a reasonable guide to this one, not a
// medical prediction.
function phaseBoundaries(avgCycleDays: number, avgPeriodDays: number) {
  const ovulationDay = Math.max(avgCycleDays - 14, avgPeriodDays + 1);
  const fertileStart = Math.max(ovulationDay - 5, avgPeriodDays + 1);
  const fertileEnd = ovulationDay + 1;
  return { periodEnd: avgPeriodDays, fertileStart, fertileEnd };
}

function phaseForCycleDay(cycleDay: number, avgCycleDays: number, avgPeriodDays: number): Phase {
  const { periodEnd, fertileStart, fertileEnd } = phaseBoundaries(avgCycleDays, avgPeriodDays);
  if (cycleDay <= periodEnd) return "Menstrual";
  if (cycleDay < fertileStart) return "Follicular";
  if (cycleDay <= fertileEnd) return "Ovulation";
  return "Luteal";
}

function estimatePhase(
  targetDate: string,
  lastPeriodStart: string,
  avgCycleDays: number,
  avgPeriodDays: number,
): { cycleDay: number; phase: Phase; isFertile: boolean } {
  const daysSince = daysBetween(lastPeriodStart, targetDate);
  const cycleDay = (((daysSince % avgCycleDays) + avgCycleDays) % avgCycleDays) + 1;
  const { fertileStart, fertileEnd } = phaseBoundaries(avgCycleDays, avgPeriodDays);
  const phase = phaseForCycleDay(cycleDay, avgCycleDays, avgPeriodDays);

  return { cycleDay, phase, isFertile: cycleDay >= fertileStart && cycleDay <= fertileEnd };
}

// Attributes each symptom entry to the phase of the cycle it fell in, based on the most
// recent period_start on or before that entry's date — so patterns reflect actual logged
// history, not just today's estimate.
function computeSymptomPhaseCounts(
  entries: LogEntry[],
  avgCycleDays: number,
  avgPeriodDays: number,
): Record<Phase, number> {
  const starts = entries.filter((e) => e.data.event === "period_start").map((e) => e.date).sort();
  const symptoms = entries.filter((e) => e.data.event === "symptom");
  const counts: Record<Phase, number> = { Menstrual: 0, Follicular: 0, Ovulation: 0, Luteal: 0 };

  for (const symptom of symptoms) {
    const start = starts.filter((s) => s <= symptom.date).at(-1);
    if (!start) continue;
    const cycleDay = daysBetween(start, symptom.date) + 1;
    if (cycleDay < 1 || cycleDay > avgCycleDays + 7) continue;
    const clampedDay = Math.min(cycleDay, avgCycleDays);
    counts[phaseForCycleDay(clampedDay, avgCycleDays, avgPeriodDays)]++;
  }

  return counts;
}

interface CycleGroup {
  label: string;
  entries: LogEntry[];
}

// Buckets entries into per-cycle blocks bounded by period_start dates, most recent first —
// gracefully degrades to one "before first logged period" bucket when there isn't a
// period_start yet, which reads the same as the old flat list in that case.
function groupByCycle(entriesDesc: LogEntry[]): CycleGroup[] {
  const entriesAsc = entriesDesc.slice().reverse();
  const groups: CycleGroup[] = [];
  let current: LogEntry[] = [];
  let currentLabel = "Before first logged period";
  for (const entry of entriesAsc) {
    if (entry.data.event === "period_start") {
      if (current.length > 0) groups.push({ label: currentLabel, entries: current });
      current = [];
      currentLabel = `🩸 Cycle starting ${entry.date}`;
    }
    current.push(entry);
  }
  if (current.length > 0) groups.push({ label: currentLabel, entries: current });
  return groups.reverse().map((g) => ({ ...g, entries: g.entries.slice().reverse() }));
}

export default function Cycle() {
  const { request } = useApi();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(today());
  const [event, setEvent] = useState<CycleEvent>("period_start");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [phaseDate, setPhaseDate] = useState(today());
  const [introDismissed, setIntroDismissed] = useState(
    () => localStorage.getItem(INTRO_DISMISSED_KEY) === "true",
  );

  function dismissIntro() {
    localStorage.setItem(INTRO_DISMISSED_KEY, "true");
    setIntroDismissed(true);
  }

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await request<{ entries: LogEntry[] }>("/logs?logType=cycle");
        if (ignore) return;
        setEntries(data.entries.slice().sort((a, b) => (a.date < b.date ? 1 : -1)));
      } catch (err) {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Failed to load cycle entries");
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

  async function logEvent(eventType: CycleEvent, entryDate: string, entryNote?: string) {
    const entry = await request<LogEntry>("/logs", {
      method: "POST",
      body: JSON.stringify({
        logType: "cycle",
        date: entryDate,
        data: { event: eventType, note: entryNote || undefined },
      }),
    });
    setEntries((prev) => [entry, ...prev].sort((a, b) => (a.date < b.date ? 1 : -1)));
    return entry;
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await logEvent(event, date, note.trim());
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save cycle entry");
    } finally {
      setSaving(false);
    }
  }

  const alreadyLoggedToday = entries.some((e) => e.date === today() && e.data.event === "period_start");

  async function handleQuickLogToday() {
    setSaving(true);
    setError(null);
    try {
      await logEvent("period_start", today());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save cycle entry");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(logId: string) {
    setError(null);
    try {
      await request(`/logs/${logId}`, { method: "DELETE" });
      setEntries((prev) => prev.filter((e) => e.logId !== logId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete entry");
    }
  }

  const { avgCycleDays, nextPredicted } = predictNextCycle(entries);
  const avgPeriodDays = computeAvgPeriodDays(entries);
  const lastPeriodStart = entries
    .filter((e) => e.data.event === "period_start")
    .map((e) => e.date)
    .sort()
    .at(-1);
  const phaseResult =
    avgCycleDays !== null && lastPeriodStart
      ? estimatePhase(phaseDate, lastPeriodStart, avgCycleDays, avgPeriodDays ?? 5)
      : null;
  const cycleGroups = groupByCycle(entries);
  const symptomPhaseCounts =
    avgCycleDays !== null ? computeSymptomPhaseCounts(entries, avgCycleDays, avgPeriodDays ?? 5) : null;
  const totalSymptoms = symptomPhaseCounts
    ? Object.values(symptomPhaseCounts).reduce((a, b) => a + b, 0)
    : 0;
  const topSymptomPhase =
    symptomPhaseCounts && totalSymptoms > 0
      ? (Object.entries(symptomPhaseCounts).sort((a, b) => b[1] - a[1])[0][0] as Phase)
      : null;

  return (
    <div className={page}>
      <h1 className={pageTitle}>🌸 Menstrual Cycle</h1>

      <button
        type="button"
        onClick={handleQuickLogToday}
        disabled={saving || alreadyLoggedToday}
        className={`${primaryButton} mb-6 w-full`}
      >
        {alreadyLoggedToday ? "🩸 Logged as period start today" : "🩸 My period started today"}
      </button>

      {!introDismissed && (
        <div className={`mb-6 flex items-start justify-between gap-4 ${card}`}>
          <div>
            <span className={badge}>Private to you</span>
            <p className="mt-2 text-sm text-ink dark:text-paper">
              Log period start/end dates and symptoms here to build a cycle-length prediction
              over time — the more start dates you log, the more accurate the estimate gets.
            </p>
            <p className={`mt-1 ${mutedText}`}>
              This data is stored under your account like everything else in LifeOs and is never
              shown to anyone else.
            </p>
          </div>
          <button
            type="button"
            onClick={dismissIntro}
            className={`${secondaryButton} shrink-0 px-2 py-1 text-xs`}
          >
            Dismiss
          </button>
        </div>
      )}

      <div
        className={`mb-6 overflow-hidden rounded-2xl border border-stone bg-paper-card shadow-sm dark:border-stone-dark dark:bg-ink-bg-card`}
      >
        {avgCycleDays === null || phaseResult === null ? (
          <div className="p-6">
            <h2 className={`mb-2 ${sectionLabel}`}>Cycle overview</h2>
            <p className={mutedText}>
              Log at least two period start dates to see predictions and a phase estimate.
            </p>
          </div>
        ) : (
          <>
            <div className={`p-6 pb-5 ${PHASE_INFO[phaseResult.phase].badge}`}>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wide opacity-80">
                How this day might feel
              </h2>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-display text-2xl font-medium">
                    {PHASE_INFO[phaseResult.phase].emoji} {phaseResult.phase}
                  </p>
                  <p className="mt-1 text-sm opacity-90">
                    Cycle day {phaseResult.cycleDay} of ~{avgCycleDays}
                    {phaseResult.isFertile ? " · fertile window" : ""}
                  </p>
                </div>
                <input
                  type="date"
                  value={phaseDate}
                  onChange={(e) => setPhaseDate(e.target.value)}
                  className="rounded-xl border border-current/20 bg-paper-card/70 px-3 py-2 text-sm text-ink dark:bg-ink-bg-card/70 dark:text-paper"
                />
              </div>

              <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-paper-card/50 dark:bg-ink-bg-card/50">
                {(["Menstrual", "Follicular", "Ovulation", "Luteal"] as Phase[]).map((p) => {
                  const { periodEnd, fertileStart, fertileEnd } = phaseBoundaries(avgCycleDays, avgPeriodDays ?? 5);
                  const spanByPhase: Record<Phase, number> = {
                    Menstrual: periodEnd,
                    Follicular: fertileStart - periodEnd,
                    Ovulation: fertileEnd - fertileStart + 1,
                    Luteal: avgCycleDays - fertileEnd,
                  };
                  const widthPct = (Math.max(spanByPhase[p], 0) / avgCycleDays) * 100;
                  return (
                    <div
                      key={p}
                      className={`${PHASE_INFO[p].bar} ${p === phaseResult.phase ? "opacity-100" : "opacity-40"} h-full`}
                      style={{ width: `${widthPct}%` }}
                      title={p}
                    />
                  );
                })}
              </div>

              <p className="mt-3 text-sm opacity-90">{PHASE_INFO[phaseResult.phase].description}</p>
              <p className="mt-2 text-xs opacity-70">
                Estimated from your own averages, not a medical prediction — actual timing can vary.
              </p>
            </div>

            <div className="grid grid-cols-3 divide-x divide-stone border-t border-stone dark:divide-stone-dark dark:border-stone-dark">
              <div className="p-4 text-center">
                <p className={sectionLabel}>Avg cycle</p>
                <p className="mt-1 text-sm font-medium text-ink dark:text-paper">{avgCycleDays} days</p>
              </div>
              <div className="p-4 text-center">
                <p className={sectionLabel}>Next period</p>
                <p className="mt-1 text-sm font-medium text-ink dark:text-paper">{nextPredicted}</p>
              </div>
              <div className="p-4 text-center">
                <p className={sectionLabel}>Avg period</p>
                <p className="mt-1 text-sm font-medium text-ink dark:text-paper">
                  {avgPeriodDays !== null ? `${avgPeriodDays} days` : "—"}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {topSymptomPhase && (
        <div className={`mb-6 ${card}`}>
          <h2 className={`mb-2 ${sectionLabel}`}>Symptom patterns</h2>
          <p className="text-sm text-ink dark:text-paper">
            You've logged symptoms most often during your{" "}
            <span className="font-medium">
              {PHASE_INFO[topSymptomPhase].emoji} {topSymptomPhase}
            </span>{" "}
            phase.
          </p>
          <div className="mt-3 flex flex-col gap-1.5">
            {(["Menstrual", "Follicular", "Ovulation", "Luteal"] as Phase[]).map((p) => {
              const count = symptomPhaseCounts![p];
              const widthPct = totalSymptoms > 0 ? (count / totalSymptoms) * 100 : 0;
              return (
                <div key={p} className="flex items-center gap-2 text-xs">
                  <span className="w-20 shrink-0 text-ink-muted dark:text-mist-muted">
                    {PHASE_INFO[p].emoji} {p}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone dark:bg-stone-dark">
                    <div className={`h-full ${PHASE_INFO[p].bar}`} style={{ width: `${widthPct}%` }} />
                  </div>
                  <span className="w-4 shrink-0 text-right text-ink-muted dark:text-mist-muted">{count}</span>
                </div>
              );
            })}
          </div>
          <p className={`mt-3 text-xs ${mutedText}`}>
            Based on {totalSymptoms} logged symptom{totalSymptoms === 1 ? "" : "s"}, attributed to the
            estimated phase of the cycle they fell in.
          </p>
        </div>
      )}

      <form onSubmit={handleAdd} className={`mb-8 flex flex-wrap items-end gap-3 ${card}`}>
        <div>
          <label className={label}>Date</label>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={input}
          />
        </div>
        <div>
          <label className={label}>Event</label>
          <select
            value={event}
            onChange={(e) => setEvent(e.target.value as CycleEvent)}
            className={input}
          >
            {(Object.keys(EVENT_LABEL) as CycleEvent[]).map((e) => (
              <option key={e} value={e}>
                {EVENT_LABEL[e]}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[160px] flex-1">
          <label className={label}>Note (optional)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. cramps, headache"
            className={`w-full ${input}`}
          />
        </div>
        <button type="submit" disabled={saving} className={primaryButton}>
          {saving ? "Saving..." : "Add entry"}
        </button>
      </form>

      {error && <p className={`mb-4 ${errorText}`}>{error}</p>}

      {loading ? (
        <p className={mutedText}>Loading entries...</p>
      ) : entries.length === 0 ? (
        <p className={mutedText}>No cycle entries yet.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {cycleGroups.map((group, i) => (
            <div key={`${group.label}-${i}`}>
              <h3 className={`mb-2 ${sectionLabel}`}>{group.label}</h3>
              <ul className="flex flex-col gap-2">
                {group.entries.map((entry) => (
                  <li
                    key={entry.logId}
                    className={`flex flex-wrap items-center justify-between gap-3 ${card}`}
                  >
                    <div>
                      <p className="text-xs font-medium text-ink-muted dark:text-mist-muted">{entry.date}</p>
                      <span
                        className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          EVENT_BADGE[entry.data.event as CycleEvent]
                        }`}
                      >
                        {EVENT_LABEL[entry.data.event as CycleEvent]}
                      </span>
                      {entry.data.note ? (
                        <p className="mt-1 text-sm text-ink dark:text-paper">{String(entry.data.note)}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(entry.logId)}
                      className={`${secondaryButton} px-2 py-1 text-xs`}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
