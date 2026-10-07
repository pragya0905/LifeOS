import { useEffect, useState } from "react";
import { useApi } from "../api/useApi";
import type { Badge } from "../types";
import { Skeleton } from "./Skeleton";
import { card, mutedText, sectionLabel } from "./ui";

const EXPANDED_KEY = "lifeos_achievements_expanded";

function loadExpanded(): boolean {
  try {
    return localStorage.getItem(EXPANDED_KEY) === "1";
  } catch {
    return false;
  }
}

function formatEarnedDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function Achievements() {
  const { request } = useApi();
  const [badges, setBadges] = useState<Badge[] | null>(null);
  const [celebrating, setCelebrating] = useState<Badge[]>([]);
  // Collapsed by default — the full 14-badge grid otherwise dominates the top of the
  // Dashboard above anything actually actionable (today's habits, routines, meds).
  // Persisted so expanding it once doesn't reset on every visit.
  const [expanded, setExpanded] = useState(loadExpanded);

  function toggleExpanded() {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(EXPANDED_KEY, next ? "1" : "0");
      } catch {
        // Best-effort — collapse state just won't persist (e.g. private browsing).
      }
      return next;
    });
  }

  useEffect(() => {
    let ignore = false;
    request<{ badges: Badge[] }>("/achievements")
      .then((data) => {
        if (ignore) return;
        setBadges(data.badges);
        const newlyUnlocked = data.badges.filter((b) => b.justUnlocked);
        if (newlyUnlocked.length > 0) {
          setCelebrating(newlyUnlocked);
          setTimeout(() => setCelebrating([]), 6000);
        }
      })
      .catch(() => {
        // Best-effort — the dashboard works fine without this card.
      });
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unlockedCount = badges?.filter((b) => b.earnedAt).length ?? 0;

  return (
    <div className={`mb-6 ${card}`}>
      <button
        type="button"
        onClick={toggleExpanded}
        aria-expanded={expanded}
        className="mb-3 flex w-full items-center justify-between text-left"
      >
        <h2 className={sectionLabel}>🏆 Achievements</h2>
        <span className="flex items-center gap-1.5">
          {badges && (
            <span className={mutedText}>
              {unlockedCount} / {badges.length}
            </span>
          )}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            className={`text-ink-muted transition-transform dark:text-mist-muted ${expanded ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {celebrating.length > 0 && (
        <div className="mb-3 flex flex-col gap-1.5 rounded-xl bg-bloom-soft px-3 py-2.5 dark:bg-bloom-soft-dark">
          {celebrating.map((b) => (
            <p key={b.key} className="text-sm font-medium text-bloom dark:text-bloom-light">
              {b.emoji} New achievement: {b.label}!
            </p>
          ))}
        </div>
      )}

      {expanded && (!badges ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {badges.map((b) => (
            <div
              key={b.key}
              title={b.description}
              className={`rounded-xl border px-3 py-2.5 text-center transition-opacity ${
                b.earnedAt
                  ? "border-bloom/40 bg-bloom-soft dark:border-bloom-light/30 dark:bg-bloom-soft-dark"
                  : "border-stone opacity-50 dark:border-stone-dark"
              }`}
            >
              <div className="text-xl">{b.emoji}</div>
              <p
                className={`mt-0.5 text-xs font-medium ${
                  b.earnedAt ? "text-bloom dark:text-bloom-light" : "text-ink dark:text-paper"
                }`}
              >
                {b.label}
              </p>
              <p className={`mt-0.5 text-[10px] ${mutedText}`}>
                {b.earnedAt ? formatEarnedDate(b.earnedAt) : b.description}
              </p>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
