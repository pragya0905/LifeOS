import { useEffect, useState } from "react";
import { useApi } from "../api/useApi";
import { todayLocal, toLocalDateStr } from "../lib/date";
import type { Goal, HabitLog, LogEntry } from "../types";
import Ring, { type RingTrend } from "./Ring";
import { Skeleton } from "./Skeleton";

function today(): string {
  return todayLocal();
}

function yesterday(): string {
  return dateOffset(1);
}

function dateOffset(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return toLocalDateStr(d);
}

// How many consecutive days (counting back from today) had a non-zero value —
// stops at the first day with 0/missing, so a still-open streak includes today.
function computeStreak(dailyValues: number[]): number {
  let streak = 0;
  for (const value of dailyValues) {
    if (value <= 0) break;
    streak += 1;
  }
  return streak;
}

function trendOf(current: number | null, previous: number | null): RingTrend | undefined {
  if (current === null || previous === null) return undefined;
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "flat";
}

function computeSleepMinutes(bedTime: string, wakeTime: string): number | null {
  const [bh, bm] = bedTime.split(":").map(Number);
  const [wh, wm] = wakeTime.split(":").map(Number);
  if ([bh, bm, wh, wm].some(Number.isNaN)) return null;
  let minutes = wh * 60 + wm - (bh * 60 + bm);
  if (minutes <= 0) minutes += 24 * 60;
  return minutes;
}

function formatHoursMinutes(totalMinutes: number): string {
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

const SLEEP_TARGET_MINUTES = 8 * 60;

export default function TodaySummaryRings() {
  const { request } = useApi();
  const [loading, setLoading] = useState(true);
  const [water, setWater] = useState(0);
  const [exercise, setExercise] = useState(0);
  const [steps, setSteps] = useState(0);
  const [sleepMinutes, setSleepMinutes] = useState<number | null>(null);
  const [goals, setGoals] = useState<Partial<Record<string, number>>>({});
  const [yWater, setYWater] = useState<number | null>(null);
  const [yExercise, setYExercise] = useState<number | null>(null);
  const [ySteps, setYSteps] = useState<number | null>(null);
  const [ySleepMinutes, setYSleepMinutes] = useState<number | null>(null);
  const [waterStreak, setWaterStreak] = useState(0);
  const [exerciseStreak, setExerciseStreak] = useState(0);
  const [stepsStreak, setStepsStreak] = useState(0);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      try {
        const date = today();
        const yDate = yesterday();
        const last7Dates = Array.from({ length: 7 }, (_, i) => dateOffset(i));
        const [rangeHabitsData, sleepData, goalsData, ySleepData] = await Promise.all([
          request<{ habits: HabitLog[] }>(
            `/habits?from=${last7Dates[last7Dates.length - 1]}&to=${date}`,
          ),
          request<{ entries: LogEntry[] }>(`/logs?logType=sleep&from=${date}&to=${date}`),
          request<{ goals: Goal[] }>("/goals"),
          request<{ entries: LogEntry[] }>(`/logs?logType=sleep&from=${yDate}&to=${yDate}`),
        ]);
        if (ignore) return;

        const byDate = (d: string, type: HabitLog["habitType"]) =>
          rangeHabitsData.habits.find(
            (h) => h.date === d && h.habitType === type,
          )?.value ?? 0;

        setWater(byDate(date, "water"));
        setExercise(byDate(date, "exercise"));
        setSteps(byDate(date, "steps"));
        setYWater(byDate(yDate, "water"));
        setYExercise(byDate(yDate, "exercise"));
        setYSteps(byDate(yDate, "steps"));

        const valuesByType = (type: HabitLog["habitType"]) =>
          last7Dates.map((d) => byDate(d, type));
        setWaterStreak(computeStreak(valuesByType("water")));
        setExerciseStreak(computeStreak(valuesByType("exercise")));
        setStepsStreak(computeStreak(valuesByType("steps")));

        const sleep = sleepData.entries[0];
        if (sleep) {
          const minutes = computeSleepMinutes(
            sleep.data.bedTime as string,
            sleep.data.wakeTime as string,
          );
          setSleepMinutes(minutes);
        }
        const ySleep = ySleepData.entries[0];
        if (ySleep) {
          setYSleepMinutes(
            computeSleepMinutes(ySleep.data.bedTime as string, ySleep.data.wakeTime as string),
          );
        }

        const goalsNext: Partial<Record<string, number>> = {};
        for (const goal of goalsData.goals) goalsNext[goal.metric] = goal.targetValue;
        setGoals(goalsNext);
      } catch {
        // Best-effort summary strip — TodayHabits below already surfaces load errors.
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

  if (loading) {
    return (
      <div className="flex gap-4 rounded-2xl border border-stone bg-paper-card p-4 shadow-sm dark:border-stone-dark dark:bg-ink-bg-card">
        <Skeleton className="h-16 w-16 rounded-full" />
        <Skeleton className="h-16 w-16 rounded-full" />
        <Skeleton className="h-16 w-16 rounded-full" />
      </div>
    );
  }

  const sleepTarget = SLEEP_TARGET_MINUTES;
  const sleepDebt = sleepMinutes !== null ? Math.max(sleepTarget - sleepMinutes, 0) : null;

  const tileClass =
    "flex items-center gap-3 px-4 py-3 border-stone dark:border-stone-dark sm:border-r last:border-r-0 border-b sm:border-b-0 last:border-b-0";

  return (
    <div className="grid grid-cols-2 rounded-2xl border border-stone bg-paper-card shadow-sm dark:border-stone-dark dark:bg-ink-bg-card sm:grid-cols-4">
      <div className={tileClass}>
        <Ring
          label="Water"
          value={water}
          target={goals.water ?? 2000}
          displayValue={`${(water / 1000).toFixed(1)} L`}
          sublabel={`/ ${(((goals.water ?? 2000) as number) / 1000).toFixed(1)} L`}
          trend={trendOf(water, yWater)}
          streakDays={waterStreak}
        />
      </div>
      <div className={tileClass}>
        <Ring
          label="Sleep"
          value={sleepMinutes ?? 0}
          target={sleepTarget}
          displayValue={sleepMinutes !== null ? formatHoursMinutes(sleepMinutes) : "—"}
          sublabel={sleepDebt ? `debt ${formatHoursMinutes(sleepDebt)}` : undefined}
          trend={trendOf(sleepMinutes, ySleepMinutes)}
        />
      </div>
      <div className={tileClass}>
        <Ring
          label="Exercise"
          value={exercise}
          target={goals.exercise ?? 30}
          displayValue={`${exercise} min`}
          sublabel={`/ ${goals.exercise ?? 30} min`}
          trend={trendOf(exercise, yExercise)}
          streakDays={exerciseStreak}
        />
      </div>
      <div className={tileClass}>
        <Ring
          label="Steps"
          value={steps}
          target={goals.steps ?? 10000}
          displayValue={steps.toLocaleString()}
          sublabel={`/ ${(goals.steps ?? 10000).toLocaleString()}`}
          trend={trendOf(steps, ySteps)}
          streakDays={stepsStreak}
        />
      </div>
    </div>
  );
}
