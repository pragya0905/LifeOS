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
  period_start: "Period start",
  period_end: "Period end",
  symptom: "Symptom",
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

export default function Cycle() {
  const { request } = useApi();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(today());
  const [event, setEvent] = useState<CycleEvent>("period_start");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
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

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const entry = await request<LogEntry>("/logs", {
        method: "POST",
        body: JSON.stringify({
          logType: "cycle",
          date,
          data: { event, note: note.trim() || undefined },
        }),
      });
      setEntries((prev) => [entry, ...prev].sort((a, b) => (a.date < b.date ? 1 : -1)));
      setNote("");
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

  return (
    <div className={page}>
      <h1 className={pageTitle}>Menstrual Cycle</h1>

      {!introDismissed && (
        <div className={`mb-6 flex items-start justify-between gap-4 ${card}`}>
          <div>
            <span className={badge}>Private to you</span>
            <p className="mt-2 text-sm text-ink dark:text-cream">
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

      <div className={`mb-6 ${card}`}>
        <h2 className={`mb-2 ${sectionLabel}`}>Prediction</h2>
        {avgCycleDays === null ? (
          <p className={mutedText}>
            Log at least two period start dates to see a cycle-length prediction.
          </p>
        ) : (
          <p className="text-sm text-ink dark:text-cream">
            Average cycle length: <span className="font-medium">{avgCycleDays} days</span>
            <br />
            Next period predicted around: <span className="font-medium">{nextPredicted}</span>
          </p>
        )}
      </div>

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
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li key={entry.logId} className={`flex items-center justify-between gap-3 ${card}`}>
              <div>
                <p className="text-xs font-medium text-ink-muted dark:text-fog-muted">{entry.date}</p>
                <p className="text-sm text-ink dark:text-cream">
                  {EVENT_LABEL[entry.data.event as CycleEvent]}
                  {entry.data.note ? ` — ${entry.data.note}` : ""}
                </p>
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
      )}
    </div>
  );
}
