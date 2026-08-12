import { useEffect, useState } from "react";
import { useApi } from "../api/useApi";
import type { Goal, HabitLog, LogEntry } from "../types";
import Ring from "./Ring";
import { card, mutedText } from "./ui";

function today(): string {
  return new Date().toISOString().slice(0, 10);
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
  const [meditation, setMeditation] = useState(0);
  const [sleepMinutes, setSleepMinutes] = useState<number | null>(null);
  const [goals, setGoals] = useState<Partial<Record<string, number>>>({});

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      try {
        const date = today();
        const [habitsData, sleepData, goalsData] = await Promise.all([
          request<{ habits: HabitLog[] }>(`/habits/${date}`),
          request<{ entries: LogEntry[] }>(`/logs?logType=sleep&from=${date}&to=${date}`),
          request<{ goals: Goal[] }>("/goals"),
        ]);
        if (ignore) return;

        for (const habit of habitsData.habits) {
          if (habit.habitType === "water") setWater(habit.value ?? 0);
          if (habit.habitType === "exercise") setExercise(habit.value ?? 0);
          if (habit.habitType === "meditation") setMeditation(habit.value ?? 0);
        }

        const sleep = sleepData.entries[0];
        if (sleep) {
          const minutes = computeSleepMinutes(
            sleep.data.bedTime as string,
            sleep.data.wakeTime as string,
          );
          setSleepMinutes(minutes);
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
      <div className={card}>
        <p className={mutedText}>Loading...</p>
      </div>
    );
  }

  const sleepTarget = SLEEP_TARGET_MINUTES;
  const sleepDebt = sleepMinutes !== null ? Math.max(sleepTarget - sleepMinutes, 0) : null;

  return (
    <div className={`${card} flex flex-wrap gap-x-8 gap-y-4`}>
      <Ring
        label="Water"
        value={water}
        target={goals.water ?? 2000}
        displayValue={`${(water / 1000).toFixed(1)} L`}
        sublabel={`/ ${(((goals.water ?? 2000) as number) / 1000).toFixed(1)} L`}
      />
      <Ring
        label="Sleep"
        value={sleepMinutes ?? 0}
        target={sleepTarget}
        displayValue={sleepMinutes !== null ? formatHoursMinutes(sleepMinutes) : "—"}
        sublabel={sleepDebt ? `debt ${formatHoursMinutes(sleepDebt)}` : undefined}
      />
      <Ring
        label="Exercise"
        value={exercise}
        target={goals.exercise ?? 30}
        displayValue={`${exercise} min`}
        sublabel={`/ ${goals.exercise ?? 30} min`}
      />
      <Ring
        label="Meditation"
        value={meditation}
        target={goals.meditation ?? 10}
        displayValue={`${meditation} min`}
        sublabel={`/ ${goals.meditation ?? 10} min`}
      />
    </div>
  );
}
