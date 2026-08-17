import { useEffect, useState } from "react";
import { useApi } from "../api/useApi";
import type { HabitLog, JournalEntry, Task } from "../types";
import { badge, card, sectionLabel } from "./ui";

interface Badge {
  key: string;
  label: string;
  unlocked: boolean;
}

const STREAK_LOOKBACK_DAYS = 30;

function dateOffset(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function bestStreak(dailyValues: number[]): number {
  let best = 0;
  let current = 0;
  for (const value of dailyValues) {
    if (value > 0) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

export default function Achievements() {
  const { request } = useApi();
  const [badges, setBadges] = useState<Badge[] | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const from = dateOffset(STREAK_LOOKBACK_DAYS - 1);
        const to = dateOffset(0);
        const [tasksData, journalData, habitsData] = await Promise.all([
          request<{ tasks: Task[] }>("/tasks"),
          request<{ entries: JournalEntry[] }>("/journal"),
          request<{ habits: HabitLog[] }>(`/habits?from=${from}&to=${to}`),
        ]);
        if (ignore) return;

        const doneTasks = tasksData.tasks.filter((t) => t.status === "done").length;

        // Reconstruct the last 30 days in order (oldest first) since the range
        // endpoint returns items unordered, then take the best run of consecutive
        // logged days across water/exercise/meditation combined.
        const dates = Array.from({ length: STREAK_LOOKBACK_DAYS }, (_, i) =>
          dateOffset(STREAK_LOOKBACK_DAYS - 1 - i),
        );
        const loggedAnyHabit = (d: string) =>
          habitsData.habits.some((h) => h.date === d && (h.value ?? 0) > 0) ? 1 : 0;
        const longestStreak = bestStreak(dates.map(loggedAnyHabit));

        setBadges([
          { key: "first-task", label: "First task done", unlocked: doneTasks >= 1 },
          { key: "task-master", label: "10 tasks done", unlocked: doneTasks >= 10 },
          { key: "streak-3", label: "3-day streak", unlocked: longestStreak >= 3 },
          { key: "streak-7", label: "7-day streak", unlocked: longestStreak >= 7 },
          { key: "journaler", label: "5 journal entries", unlocked: journalData.entries.length >= 5 },
        ]);
      } catch {
        // Best-effort — badges just don't render if this fails.
      }
    }
    load();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unlocked = badges?.filter((b) => b.unlocked) ?? [];
  if (!badges || unlocked.length === 0) return null;

  return (
    <div className={`mb-6 ${card}`}>
      <h2 className={`mb-2 ${sectionLabel}`}>Achievements</h2>
      <div className="flex flex-wrap gap-1.5">
        {unlocked.map((b) => (
          <span key={b.key} className={badge}>
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}
