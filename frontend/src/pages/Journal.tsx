import { useEffect, useRef, useState, type FormEvent } from "react";
import { useApi } from "../api/useApi";
import { useSpeechToText } from "../hooks/useSpeechToText";
import { formatDetection } from "../lib/formatExtraction";
import { todayLocal } from "../lib/date";
import type { JournalEntry, LogEntry } from "../types";
import {
  badge,
  card,
  errorText,
  input,
  label,
  mutedText,
  page,
  pageTitle,
  pillButton,
  pillButtonInactive,
  primaryButton,
} from "../components/ui";

function today(): string {
  return todayLocal();
}

function joinText(base: string, addition: string): string {
  if (!addition) return base;
  if (!base) return addition;
  return base.endsWith(" ") || base.endsWith("\n") ? base + addition : `${base} ${addition}`;
}

const PROMPTS = [
  "Today I'm grateful for...",
  "The best part of today was...",
  "What's on my mind right now...",
  "Tomorrow I want to focus on...",
];

const MOOD_LABELS: Record<number, string> = {
  1: "Very bad",
  2: "Bad",
  3: "Okay",
  4: "Good",
  5: "Very good",
};

export default function Journal() {
  const { request } = useApi();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(today());
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [usedVoice, setUsedVoice] = useState(false);
  const [search, setSearch] = useState("");

  const [moodLogId, setMoodLogId] = useState<string | null>(null);
  const [mood, setMood] = useState<number | null>(null);
  const [savingMood, setSavingMood] = useState(false);

  const baseTextRef = useRef("");

  const {
    supported: voiceSupported,
    listening,
    error: voiceError,
    start: startListening,
    stop: stopListening,
  } = useSpeechToText((transcript, isFinal) => {
    setText(joinText(baseTextRef.current, transcript));
    if (isFinal) setUsedVoice(true);
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
  const filteredEntries = search.trim()
    ? entries.filter((entry) => entry.text.toLowerCase().includes(search.trim().toLowerCase()))
    : entries;

  // Only one entry is allowed per day — whenever the selected date already has
  // an entry, load it into the form so saving edits it instead of duplicating it.
  useEffect(() => {
    setText(existingEntry?.text ?? "");
    setUsedVoice(false);
    baseTextRef.current = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, entries]);

  useEffect(() => {
    let ignore = false;
    async function loadMood() {
      try {
        const data = await request<{ entries: LogEntry[] }>(
          `/logs?logType=mood&from=${date}&to=${date}`,
        );
        if (ignore) return;
        const existing = data.entries[0];
        setMoodLogId(existing?.logId ?? null);
        setMood(existing ? (existing.data.rating as number) : null);
      } catch {
        // Best-effort — mood picker just stays unset if this fails.
      }
    }
    loadMood();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function selectMood(rating: number) {
    setSavingMood(true);
    try {
      const data = { rating };
      const entry = moodLogId
        ? await request<LogEntry>(`/logs/${moodLogId}`, {
            method: "PATCH",
            body: JSON.stringify({ data }),
          })
        : await request<LogEntry>("/logs", {
            method: "POST",
            body: JSON.stringify({ logType: "mood", date, data }),
          });
      setMoodLogId(entry.logId);
      setMood(rating);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save mood");
    } finally {
      setSavingMood(false);
    }
  }

  function insertPrompt(prompt: string) {
    setText((prev) => joinText(prev, prompt));
  }

  function handleToggleVoice() {
    if (listening) {
      stopListening();
      return;
    }
    baseTextRef.current = text;
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
    <div className={page}>
      <h1 className={pageTitle}>Journal</h1>

      <form onSubmit={handleSave} className={`mb-8 flex flex-col gap-3 ${card}`}>
        <div>
          <label className={label}>Date</label>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={input}
          />
          {existingEntry && (
            <p className="mt-1 text-xs text-sage">
              Editing the existing entry for this date — only one entry per day is allowed.
            </p>
          )}
        </div>
        <div>
          <label className={label}>Mood</label>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                type="button"
                disabled={savingMood}
                onClick={() => selectMood(rating)}
                title={MOOD_LABELS[rating]}
                className={`${pillButton} px-3 py-1 ${
                  mood === rating ? "border-sage bg-sage text-cream-card" : pillButtonInactive
                }`}
              >
                {rating}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={label}>Prompts</label>
          <div className="flex flex-wrap gap-1.5">
            {PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => insertPrompt(prompt)}
                className={`${pillButton} ${pillButtonInactive} px-3 py-1`}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className={label}>Entry</label>
            {voiceSupported ? (
              <button
                type="button"
                onClick={handleToggleVoice}
                className={`${pillButton} px-3 py-1 ${
                  listening
                    ? "border-terracotta bg-terracotta text-cream-card"
                    : pillButtonInactive
                }`}
              >
                {listening ? "Stop listening" : "Voice input"}
              </button>
            ) : (
              <span className="text-xs text-fog-muted">Voice input not supported in this browser</span>
            )}
          </div>
          <textarea
            required
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="How did today go?"
            className={`w-full ${input}`}
          />
          {listening && <p className="mt-1 text-xs text-terracotta">Listening...</p>}
          {voiceError && <p className={`mt-1 text-xs ${errorText}`}>{voiceError}</p>}
        </div>
        <button type="submit" disabled={saving} className={`self-start ${primaryButton}`}>
          {saving ? "Saving..." : existingEntry ? "Update entry" : "Save entry"}
        </button>
      </form>

      {error && <p className={`mb-4 ${errorText}`}>{error}</p>}

      {entries.length > 0 && (
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search journal entries..."
          aria-label="Search journal entries"
          className={`mb-4 w-full ${input}`}
        />
      )}

      {loading ? (
        <p className={mutedText}>Loading entries...</p>
      ) : entries.length === 0 ? (
        <p className={mutedText}>No journal entries yet.</p>
      ) : filteredEntries.length === 0 ? (
        <p className={mutedText}>No entries match "{search}".</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filteredEntries.map((entry) => (
            <li key={entry.date} className={card}>
              <p className="mb-1 flex items-center gap-2 text-xs font-medium text-ink-muted dark:text-fog-muted">
                {entry.date}
                {entry.voiceInput && <span className={badge}>Voice</span>}
              </p>
              <p className="mb-1 text-xs text-fog-muted">
                Logged {new Date(entry.createdAt).toLocaleString()}
                {entry.updatedAt !== entry.createdAt &&
                  ` · edited ${new Date(entry.updatedAt).toLocaleString()}`}
              </p>
              <p className="whitespace-pre-wrap text-sm text-ink dark:text-cream">{entry.text}</p>
              {formatDetection(entry.aiExtracted) && (
                <p className="mt-1 text-xs text-sage">{formatDetection(entry.aiExtracted)}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
