import { useEffect, useState } from "react";
import { useApi } from "../api/useApi";
import type { JournalEntry } from "../types";
import { extractionParts } from "../lib/formatExtraction";
import { todayLocal } from "../lib/date";
import { badge, card, mutedText, sectionLabel } from "./ui";

function today(): string {
  return todayLocal();
}

export default function ExtractionLedger() {
  const { request } = useApi();
  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState<JournalEntry | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      try {
        const date = today();
        const data = await request<{ entries: JournalEntry[] }>(`/journal?from=${date}&to=${date}`);
        if (!ignore) setEntry(data.entries[0] ?? null);
      } catch {
        // Best-effort widget — Journal page is the source of truth if this fails to load.
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

  const parts = entry ? extractionParts(entry.aiExtracted) : [];

  return (
    <div className={card}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className={sectionLabel}>Extraction ledger</h2>
        <span className={badge}>JSON patch</span>
      </div>
      <p className="mb-2 text-sm font-medium text-ink dark:text-cream">
        What the model wrote to today
      </p>
      {loading ? (
        <p className={mutedText}>Loading...</p>
      ) : !entry ? (
        <p className={mutedText}>
          Nothing logged yet. Dictate a journal entry — "drank a glass of water, did my AM
          skincare" — and the fields it touches will show up here.
        </p>
      ) : parts.length === 0 ? (
        <p className={mutedText}>
          Today's entry didn't mention anything the model recognized yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {parts.map((part, i) => (
            <li key={i} className="text-sm text-ink-muted dark:text-fog-muted">
              • {part}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
