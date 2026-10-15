import { Link } from "react-router-dom";
import { Card } from "./Card";
import { Skeleton } from "./Skeleton";
import { mutedText, sectionLabel } from "./ui";
import type { ProgressSummary } from "../types";

// Deliberately built from the cheap, already-computed /progress-summary endpoint, not the
// AI-generated /insights endpoint — that one calls Claude on every request (confirmed in
// backend/src/common/insights.ts, no caching), so fetching it eagerly on every Today load
// would be slow and costly. This card teases real numbers instead and links through to the
// full page, where fetching the AI summary is an explicit, one-at-a-time user action.
export function TodayInsightsRecap({ summary }: { summary: ProgressSummary | null }) {
  if (summary === null) {
    return (
      <Card>
        <p className={`mb-2 ${sectionLabel}`}>This week</p>
        <Skeleton className="h-4 w-3/4" />
      </Card>
    );
  }

  const fallingBehind = summary.wishes.filter((w) => w.fallingBehind);
  const bestStreak = summary.habits.slice().sort((a, b) => b.currentStreakDays - a.currentStreakDays)[0];
  const tightestBudget = summary.budgets
    .slice()
    .sort((a, b) => a.remainingThisMonth - b.remainingThisMonth)[0];

  const highlights: string[] = [];
  if (bestStreak && bestStreak.currentStreakDays > 0) {
    highlights.push(`${bestStreak.habitType} streak: ${bestStreak.currentStreakDays}d`);
  }
  if (fallingBehind.length > 0) {
    highlights.push(`${fallingBehind.length} wish${fallingBehind.length === 1 ? "" : "es"} falling behind`);
  }
  if (tightestBudget) {
    highlights.push(`${tightestBudget.category}: ${tightestBudget.remainingThisMonth < 0 ? "over" : `${tightestBudget.remainingThisMonth} left`}`);
  }

  return (
    <Card>
      <p className={`mb-2 ${sectionLabel}`}>This week</p>
      {highlights.length === 0 ? (
        <p className={mutedText}>Log a bit more and a weekly picture will show up here.</p>
      ) : (
        <ul className="mb-2 flex flex-col gap-1">
          {highlights.map((h, i) => (
            <li key={i} className="text-sm capitalize text-ink dark:text-paper">
              {h}
            </li>
          ))}
        </ul>
      )}
      <Link to="/insights" className="text-xs text-bloom hover:underline">
        View full insights →
      </Link>
    </Card>
  );
}
