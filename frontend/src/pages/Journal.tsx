import { useEffect, useRef, useState, type FormEvent } from "react";
import { useApi } from "../api/useApi";
import { useSpeechToText } from "../hooks/useSpeechToText";
import type { JournalEntry } from "../types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function joinText(base: string, addition: string): string {
  if (!addition) return base;
  if (!base) return addition;
  return base.endsWith(" ") || base.endsWith("\n") ? base + addition : `${base} ${addition}`;
}

const HABIT_LABEL: Record<string, string> = {
  water: "water",
  exercise: "exercise",
  medicine: "medicine",
};

function formatDetection(aiExtracted: JournalEntry["aiExtracted"]): string | null {
  if (!aiExtracted) return null;
  const parts = Object.entries(aiExtracted)
    .filter(([, value]) => value !== "unclear")
    .map(([habit, value]) => `${HABIT_LABEL[habit] ?? habit} ${value === "done" ? "✓" : "— missed"}`);
  return parts.length > 0 ? `Detected: ${parts.join(", ")}` : null;
}

export default function Journal() {
  const { request } = useApi();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(today());
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [usedVoice, setUsedVoice] = useState(false);

  const baseTextRef = useRef("");
  const finalTranscriptRef = useRef("");

  const {
    supported: voiceSupported,
    listening,
    error: voiceError,
    start: startListening,
    stop: stopListening,
  } = useSpeechToText((transcript, isFinal) => {
    if (isFinal) {
      finalTranscriptRef.current = joinText(finalTranscriptRef.current, transcript.trim());
      setText(joinText(baseTextRef.current, finalTranscriptRef.current));
      setUsedVoice(true);
    } else {
      setText(joinText(baseTextRef.current, joinText(finalTranscriptRef.current, transcript.trim())));
    }
  });

  useEffect(() => {
    let ignore = false;

    async function loadEntries() {
      setLoading(true);
      setError(null);
      try {
        const data = await request<{ entries: JournalEntry[] }>("/journal");
        if (ignore) return;
        setEntries(data.entries.slice().sort((a, b) => (a.date < b.date ? 1 : -1)));
      } catch (err) {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Failed to load journal entries");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadEntries();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const existingEntry = entries.find((entry) => entry.date === date);

  // Only one entry is allowed per day — whenever the selected date already has
  // an entry, load it into the form so saving edits it instead of duplicating it.
  useEffect(() => {
    setText(existingEntry?.text ?? "");
    setUsedVoice(false);
    baseTextRef.current = "";
    finalTranscriptRef.current = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, entries]);

  function handleToggleVoice() {
    if (listening) {
      stopListening();
      return;
    }
    baseTextRef.current = text;
    finalTranscriptRef.current = "";
    startListening();
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    if (listening) stopListening();
    setSaving(true);
    setError(null);
    try {
      const entry = await request<JournalEntry>(
        existingEntry ? `/journal/${date}` : "/journal",
        {
          method: existingEntry ? "PATCH" : "POST",
          body: JSON.stringify({ date, text: text.trim(), voiceInput: usedVoice }),
        },
      );
      setEntries((prev) => {
        const withoutDate = prev.filter((e) => e.date !== date);
        return [entry, ...withoutDate].sort((a, b) => (a.date < b.date ? 1 : -1));
      });
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
          {existingEntry && (
            <p className="mt-1 text-xs text-indigo-600 dark:text-indigo-400">
              Editing the existing entry for this date — only one entry per day is allowed.
            </p>
          )}
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              Entry
            </label>
            {voiceSupported ? (
              <button
                type="button"
                onClick={handleToggleVoice}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  listening
                    ? "border-red-600 bg-red-600 text-white"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
                }`}
              >
                {listening ? "Stop listening" : "Voice input"}
              </button>
            ) : (
              <span className="text-xs text-gray-400">Voice input not supported in this browser</span>
            )}
          </div>
          <textarea
            required
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="How did today go?"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
          {listening && <p className="mt-1 text-xs text-red-600">Listening...</p>}
          {voiceError && <p className="mt-1 text-xs text-red-600">{voiceError}</p>}
        </div>
        <button
          type="submit"
          disabled={saving}
          className="self-start rounded-md bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? "Saving..." : existingEntry ? "Update entry" : "Save entry"}
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
              key={entry.date}
              className="rounded-md border border-gray-200 p-3 dark:border-gray-700"
            >
              <p className="mb-1 flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                {entry.date}
                {entry.voiceInput && (
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                    Voice
                  </span>
                )}
              </p>
              <p className="mb-1 text-xs text-gray-400 dark:text-gray-500">
                Logged {new Date(entry.createdAt).toLocaleString()}
                {entry.updatedAt !== entry.createdAt &&
                  ` · edited ${new Date(entry.updatedAt).toLocaleString()}`}
              </p>
              <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">
                {entry.text}
              </p>
              {formatDetection(entry.aiExtracted) && (
                <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                  {formatDetection(entry.aiExtracted)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
