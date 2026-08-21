import type { LogEntry } from "../types";

export type Phase = "Menstrual" | "Follicular" | "Ovulation" | "Luteal";

export const PHASE_INFO: Record<Phase, { emoji: string; description: string; badge: string; bar: string }> = {
  Menstrual: {
    emoji: "🩸",
    description: "Your period. Energy is often lower here — a natural stretch to take it easier.",
    badge: "bg-alert-soft text-alert dark:bg-alert-soft-dark dark:text-alert-light",
    bar: "bg-alert",
  },
  Follicular: {
    emoji: "🌱",
    description: "Between your period and ovulation. Energy and mood tend to rise through this stretch.",
    badge: "bg-stone text-ink-muted dark:bg-stone-dark dark:text-mist-muted",
    bar: "bg-stone-dark dark:bg-mist-muted",
  },
  Ovulation: {
    emoji: "🥚",
    description: "Your estimated fertile window — ovulation is expected around now.",
    badge: "bg-amber-soft text-amber-ink dark:bg-amber-soft-dark dark:text-amber-ink-dark",
    bar: "bg-amber",
  },
  Luteal: {
    emoji: "🌙",
    description: "After ovulation. PMS-type symptoms (mood, cramps, fatigue) are more common later in this phase.",
    badge: "bg-bloom-soft text-bloom dark:bg-bloom-soft-dark dark:text-bloom-light",
    bar: "bg-bloom",
  },
};

export function daysBetween(a: string, b: string): number {
  const d1 = new Date(`${a}T00:00:00Z`);
  const d2 = new Date(`${b}T00:00:00Z`);
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

export function predictNextCycle(entries: LogEntry[]): { avgCycleDays: number | null; nextPredicted: string | null } {
  const starts = entries
    .filter((e) => e.data.event === "period_start")
    .map((e) => e.date)
    .sort();
  if (starts.length < 2) return { avgCycleDays: null, nextPredicted: null };

  const gaps: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    gaps.push(daysBetween(starts[i - 1], starts[i]));
  }
  const avgCycleDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);

  const last = new Date(`${starts[starts.length - 1]}T00:00:00Z`);
  last.setUTCDate(last.getUTCDate() + avgCycleDays);

  return { avgCycleDays, nextPredicted: last.toISOString().slice(0, 10) };
}

// Pairs each period_start with the next period_end on or after it — a best-effort match,
// not a strict one-to-one, since a day with no matching end just doesn't contribute a length.
export function computeAvgPeriodDays(entries: LogEntry[]): number | null {
  const starts = entries.filter((e) => e.data.event === "period_start").map((e) => e.date).sort();
  const ends = entries.filter((e) => e.data.event === "period_end").map((e) => e.date).sort();
  const lengths: number[] = [];
  for (const start of starts) {
    const end = ends.find((e) => e >= start);
    if (end) lengths.push(daysBetween(start, end) + 1);
  }
  if (lengths.length === 0) return null;
  return Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
}

// Standard cycle-phase estimation (the same math apps like Clue use): the luteal phase is
// usually a fairly fixed ~14 days regardless of cycle length, so ovulation is estimated by
// counting back 14 days from the *next* predicted period rather than forward from this one —
// this is an estimate assuming your logged cycles are a reasonable guide to this one, not a
// medical prediction.
export function phaseBoundaries(avgCycleDays: number, avgPeriodDays: number) {
  const ovulationDay = Math.max(avgCycleDays - 14, avgPeriodDays + 1);
  const fertileStart = Math.max(ovulationDay - 5, avgPeriodDays + 1);
  const fertileEnd = ovulationDay + 1;
  return { periodEnd: avgPeriodDays, fertileStart, fertileEnd };
}

export function phaseForCycleDay(cycleDay: number, avgCycleDays: number, avgPeriodDays: number): Phase {
  const { periodEnd, fertileStart, fertileEnd } = phaseBoundaries(avgCycleDays, avgPeriodDays);
  if (cycleDay <= periodEnd) return "Menstrual";
  if (cycleDay < fertileStart) return "Follicular";
  if (cycleDay <= fertileEnd) return "Ovulation";
  return "Luteal";
}

export function estimatePhase(
  targetDate: string,
  lastPeriodStart: string,
  avgCycleDays: number,
  avgPeriodDays: number,
): { cycleDay: number; phase: Phase; isFertile: boolean } {
  const daysSince = daysBetween(lastPeriodStart, targetDate);
  const cycleDay = (((daysSince % avgCycleDays) + avgCycleDays) % avgCycleDays) + 1;
  const { fertileStart, fertileEnd } = phaseBoundaries(avgCycleDays, avgPeriodDays);
  const phase = phaseForCycleDay(cycleDay, avgCycleDays, avgPeriodDays);

  return { cycleDay, phase, isFertile: cycleDay >= fertileStart && cycleDay <= fertileEnd };
}
