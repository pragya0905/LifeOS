import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../api/useApi";
import type { LogEntry } from "../types";

type CycleEvent = "period_start" | "period_end" | "symptom";

const EVENT_LABEL: Record<CycleEvent, string> = {
  period_start: "Period start",
  period_end: "Period end",
  symptom: "Symptom",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
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
    <div className="mx-auto mt-8 w-full max-w-2xl px-4">
      <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">
        Menstrual Cycle
      </h1>

      <div className="mb-6 rounded-md border border-gray-200 p-4 dark:border-gray-700">
        <h2 className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">Prediction</h2>
        {avgCycleDays === null ? (
          <p className="text-sm text-gray-500">
            Log at least two period start dates to see a cycle-length prediction.
          </p>
        ) : (
          <p className="text-sm text-gray-900 dark:text-gray-100">
            Average cycle length: <span className="font-medium">{avgCycleDays} days</span>
            <br />
            Next period predicted around:{" "}
            <span className="font-medium">{nextPredicted}</span>
          </p>
        )}
      </div>

      <form
        onSubmit={handleAdd}
        className="mb-8 flex flex-wrap items-end gap-3 rounded-md border border-gray-200 p-4 dark:border-gray-700"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            Date
          </label>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            Event
          </label>
          <select
            value={event}
            onChange={(e) => setEvent(e.target.value as CycleEvent)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            {(Object.keys(EVENT_LABEL) as CycleEvent[]).map((e) => (
              <option key={e} value={e}>
                {EVENT_LABEL[e]}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[160px] flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            Note (optional)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. cramps, headache"
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Add entry"}
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading entries...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-500">No cycle entries yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li
              key={entry.logId}
              className="flex items-center justify-between gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-700"
            >
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{entry.date}</p>
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  {EVENT_LABEL[entry.data.event as CycleEvent]}
                  {entry.data.note ? ` — ${entry.data.note}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(entry.logId)}
                className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
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
