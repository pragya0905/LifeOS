import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../api/useApi";
import type { JournalEntry } from "../types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Journal() {
  const { request } = useApi();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(today());
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadEntries() {
    setLoading(true);
    setError(null);
    try {
      const data = await request<{ entries: JournalEntry[] }>("/journal");
      setEntries(data.entries.slice().sort((a, b) => (a.date < b.date ? 1 : -1)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load journal entries");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const entry = await request<JournalEntry>("/journal", {
        method: "POST",
        body: JSON.stringify({ date, text: text.trim() }),
      });
      setEntries((prev) =>
        [entry, ...prev].sort((a, b) => (a.date < b.date ? 1 : -1)),
      );
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save entry");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto mt-8 w-full max-w-2xl px-4">
      <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">Journal</h1>

      <form
        onSubmit={handleSave}
        className="mb-8 flex flex-col gap-3 rounded-md border border-gray-200 p-4 dark:border-gray-700"
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
            Entry
          </label>
          <textarea
            required
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="How did today go?"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="self-start rounded-md bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save entry"}
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading entries...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-500">No journal entries yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((entry) => (
            <li
              key={entry.entryId}
              className="rounded-md border border-gray-200 p-3 dark:border-gray-700"
            >
              <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                {entry.date}
              </p>
              <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">
                {entry.text}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
