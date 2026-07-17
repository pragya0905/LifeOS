import { useEffect, useRef, useState, type FormEvent } from "react";
import { useApi } from "../api/useApi";
import { useSpeechToText } from "../hooks/useSpeechToText";
import type { JournalEntry } from "../types";
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
  return new Date().toISOString().slice(0, 10);
}

function joinText(base: string, addition: string): string {
  if (!addition) return base;
  if (!base) return addition;
  return base.endsWith(" ") || base.endsWith("\n") ? base + addition : `${base} ${addition}`;
}

function formatDetection(aiExtracted: JournalEntry["aiExtracted"]): string | null {
  if (!aiExtracted) return null;
  const parts: string[] = [];
  if (aiExtracted.waterMl !== null) parts.push(`water ${aiExtracted.waterMl}ml`);
  if (aiExtracted.exerciseMinutes !== null) parts.push(`exercise ${aiExtracted.exerciseMinutes}min`);
  if (aiExtracted.meditationMinutes !== null) parts.push(`meditation ${aiExtracted.meditationMinutes}min`);
  if (aiExtracted.food !== null) parts.push(`food: ${aiExtracted.food}`);
  if (aiExtracted.sleep !== null) {
    parts.push(`sleep ${aiExtracted.sleep.bedTime}–${aiExtracted.sleep.wakeTime}`);
  }
  if (aiExtracted.weightKg !== null) parts.push(`weight ${aiExtracted.weightKg}kg`);
  if (aiExtracted.moodRating !== null) parts.push(`mood ${aiExtracted.moodRating}/5`);
  if (aiExtracted.cycleEvent !== null) parts.push(`cycle: ${aiExtracted.cycleEvent.replace("_", " ")}`);
  for (const medication of aiExtracted.medicationNamesTaken) parts.push(`took ${medication}`);
  for (const step of aiExtracted.routineStepsCompleted) parts.push(`routine: ${step}`);
  for (const call of aiExtracted.calls) {
    parts.push(
      `call with ${call.personName}${call.durationMinutes !== null ? ` (${call.durationMinutes}min)` : ""}`,
    );
  }
  for (const expense of aiExtracted.expenses) {
    parts.push(`expense: ${expense.category}${expense.amount !== null ? ` (${expense.amount})` : ""}`);
  }
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

      {loading ? (
        <p className={mutedText}>Loading entries...</p>
      ) : entries.length === 0 ? (
        <p className={mutedText}>No journal entries yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((entry) => (
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
