import { ALL_DAYS, appliesOnDate } from "./weekdays";
import { addDays } from "./date";
import { computeAvgPeriodDays, estimatePhase, predictNextCycle } from "./cyclePhase";
import type { LogEntry } from "../types";

// Pure layout logic for the 24h timeline page. Everything here works in minutes-from-midnight
// on a single local calendar date, so it can be tested without a DOM or a network.

export const DAY_MINUTES = 24 * 60;

export type TimelineKind = "sleep" | "routine" | "med" | "meal" | "task" | "workout" | "call";

// Meals have no clock time in the meal plan, so each slot sits at a fixed nominal time.
// These are display placement only; nothing is stored, and the real plan is unchanged.
export const MEAL_NOMINAL_MIN: Record<string, number> = { breakfast: 8 * 60, lunch: 13 * 60, snack: 16 * 60, dinner: 19 * 60 };
export const MEAL_DURATION_MIN = 30;

export interface TimelineBlock {
  id: string;
  kind: TimelineKind;
  title: string;
  startMin: number;
  endMin: number;
  // Lane index assigned by assignLanes(); blocks that overlap in time get different lanes.
  lane: number;
  // Plain-text status shown on the block, e.g. "✓ Done". Filled in by the page from logs.
  status?: string;
  // Whether this block's end wraps past midnight (sleep only). The page draws the
  // continuation on the same day as a separate segment with `continuesFromPrevious`.
  continuesFromPrevious?: boolean;
  // Task-only: time set aside (deep work, commute) rather than a to-do to tick off.
  protected?: boolean;
}

export interface UnscheduledItem {
  id: string;
  kind: TimelineKind;
  title: string;
  reason: "no time set" | "no duration set";
}

export interface TimelineSource {
  routines: { routineId: string; name: string; timeOfDay?: string; estimatedMinutes?: number; daysOfWeek?: number[] }[];
  medications: { medicationId: string; name: string; timeOfDay?: string; estimatedMinutes?: number; daysOfWeek?: number[] }[];
  tasks: { taskId: string; title: string; dueDate?: string; dueTime?: string; scheduleTime?: string; estimatedHours?: number; status: string; blockType?: "task" | "protected" }[];
  // Sleep logs for the date, as stored: bedTime/wakeTime are "HH:MM" and either may be missing.
  sleep: { logId: string; bedTime?: string; wakeTime?: string }[];
  // Meal plan slots for the date. Only the text and slot name matter here.
  meals: { mealType: string; text: string }[];
  // Exercise habit log for the date, if it has a start time — one row per day, so at most one.
  workout?: { startTime?: string; minutes?: number };
  // Call log entries for the date that have a start time.
  calls: { logId: string; personName: string; startTime?: string; durationMinutes?: number }[];
}

// "HH:MM" -> minutes from midnight. Returns undefined for anything malformed rather than
// guessing, so a bad value drops the item into "Unscheduled" instead of drawing it wrong.
export function parseHm(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return undefined;
  return h * 60 + min;
}

// Builds the blocks and the unscheduled list for one local date. `date` is the viewed day.
export function buildTimeline(
  source: TimelineSource,
  date: Date,
  dateStr: string,
  // Overridable per device (the page reads/writes this via localStorage, same as the colour
  // picker); defaults to MEAL_NOMINAL_MIN when the caller has no preference saved.
  mealTimes: Record<string, number> = MEAL_NOMINAL_MIN,
): { blocks: TimelineBlock[]; unscheduled: UnscheduledItem[] } {
  const blocks: TimelineBlock[] = [];
  const unscheduled: UnscheduledItem[] = [];

  for (const r of source.routines) {
    if (!appliesOnDate(r.daysOfWeek, date)) continue;
    pushTimed(blocks, unscheduled, { id: `routine:${r.routineId}`, kind: "routine", title: r.name, start: r.timeOfDay, duration: r.estimatedMinutes });
  }

  for (const m of source.medications) {
    if (!appliesOnDate(m.daysOfWeek, date)) continue;
    pushTimed(blocks, unscheduled, { id: `med:${m.medicationId}`, kind: "med", title: m.name, start: m.timeOfDay, duration: m.estimatedMinutes });
  }

  for (const t of source.tasks) {
    if (t.status === "done" || t.dueDate !== dateStr) continue;
    const start = t.dueTime ?? t.scheduleTime;
    const duration = t.estimatedHours != null ? Math.round(t.estimatedHours * 60) : undefined;
    const before = blocks.length;
    pushTimed(blocks, unscheduled, { id: `task:${t.taskId}`, kind: "task", title: t.title, start, duration });
    if (t.blockType === "protected" && blocks.length > before) blocks[blocks.length - 1].protected = true;
  }

  if (source.workout) {
    pushTimed(blocks, unscheduled, { id: "workout", kind: "workout", title: "Workout", start: source.workout.startTime, duration: source.workout.minutes });
  }

  for (const c of source.calls) {
    pushTimed(blocks, unscheduled, { id: `call:${c.logId}`, kind: "call", title: `Call with ${c.personName}`, start: c.startTime, duration: c.durationMinutes });
  }

  for (const m of source.meals) {
    const start = mealTimes[m.mealType];
    if (start === undefined || !m.text.trim()) continue;
    blocks.push({ id: `meal:${m.mealType}`, kind: "meal", title: m.text.trim(), startMin: start, endMin: start + MEAL_DURATION_MIN, lane: 0 });
  }

  for (const s of source.sleep) {
    const bed = parseHm(s.bedTime);
    const wake = parseHm(s.wakeTime);
    if (bed === undefined || wake === undefined) {
      unscheduled.push({ id: `sleep:${s.logId}`, kind: "sleep", title: "Sleep", reason: "no time set" });
      continue;
    }
    if (wake > bed) {
      // Same-day block, e.g. a nap 13:00 -> 14:30.
      blocks.push({ id: `sleep:${s.logId}`, kind: "sleep", title: "Sleep", startMin: bed, endMin: wake, lane: 0 });
    } else {
      // Overnight: the part before midnight belongs to the bedtime date, the part after
      // midnight is the morning of this date.
      blocks.push({ id: `sleep:${s.logId}:morning`, kind: "sleep", title: "Sleep", startMin: 0, endMin: wake, lane: 0, continuesFromPrevious: true });
      blocks.push({ id: `sleep:${s.logId}:night`, kind: "sleep", title: "Sleep", startMin: bed, endMin: DAY_MINUTES, lane: 0 });
    }
  }

  return { blocks: assignLanes(blocks), unscheduled };
}

function pushTimed(
  blocks: TimelineBlock[],
  unscheduled: UnscheduledItem[],
  item: { id: string; kind: TimelineKind; title: string; start?: string; duration?: number },
) {
  const start = parseHm(item.start);
  if (start === undefined) {
    unscheduled.push({ id: item.id, kind: item.kind, title: item.title, reason: "no time set" });
    return;
  }
  if (item.duration === undefined || item.duration <= 0) {
    unscheduled.push({ id: item.id, kind: item.kind, title: item.title, reason: "no duration set" });
    return;
  }
  // A block running past midnight is clipped to the day; the rest is not shown here.
  blocks.push({ id: item.id, kind: item.kind, title: item.title, startMin: start, endMin: Math.min(start + item.duration, DAY_MINUTES), lane: 0 });
}

// Greedy interval colouring: each block takes the lowest lane that's free at its start.
// Blocks that overlap in time end up in different lanes, so the page can draw them side
// by side instead of stacking one on top of the other.
export function assignLanes(blocks: TimelineBlock[]): TimelineBlock[] {
  const sorted = blocks.slice().sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const laneEnds: number[] = [];
  for (const b of sorted) {
    let lane = laneEnds.findIndex((end) => end <= b.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(b.endMin);
    } else {
      laneEnds[lane] = b.endMin;
    }
    b.lane = lane;
  }
  return sorted;
}

// Spans with no block over them, at least `minGapMin` long. Used for the "free" labels.
export function findFreeGaps(blocks: TimelineBlock[], minGapMin = 60): { startMin: number; endMin: number }[] {
  const sorted = blocks.slice().sort((a, b) => a.startMin - b.startMin);
  const gaps: { startMin: number; endMin: number }[] = [];
  let cursor = 0;
  for (const b of sorted) {
    if (b.startMin - cursor >= minGapMin) gaps.push({ startMin: cursor, endMin: b.startMin });
    cursor = Math.max(cursor, b.endMin);
  }
  if (DAY_MINUTES - cursor >= minGapMin) gaps.push({ startMin: cursor, endMin: DAY_MINUTES });
  return gaps;
}

// Pairs of blocks that overlap in time (and therefore need a visible warning).
export function findOverlaps(blocks: TimelineBlock[]): [TimelineBlock, TimelineBlock][] {
  const pairs: [TimelineBlock, TimelineBlock][] = [];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i];
      const b = blocks[j];
      if (a.startMin < b.endMin && b.startMin < a.endMin) pairs.push([a, b]);
    }
  }
  return pairs;
}

// Total minutes per kind, for the plain-text totals line. Sleep counts both segments of an
// overnight block once, because the two segments together are one night.
export function totalsByKind(blocks: TimelineBlock[]): Record<TimelineKind, number> {
  const totals: Record<TimelineKind, number> = { sleep: 0, routine: 0, med: 0, meal: 0, task: 0, workout: 0, call: 0 };
  for (const b of blocks) totals[b.kind] += b.endMin - b.startMin;
  return totals;
}

// Formats minutes as "7h 30m", "2h", or "45m".
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Visible window in minutes. The overview is the whole day; zoomed views are centred on
// `centreMin` and clamped to the day so they never show negative or past-midnight time.
export function viewportFor(zoomHours: number, centreMin: number): { startMin: number; endMin: number } {
  const spanMin = Math.min(DAY_MINUTES, Math.max(60, zoomHours * 60));
  let startMin = centreMin - spanMin / 2;
  if (startMin < 0) startMin = 0;
  if (startMin + spanMin > DAY_MINUTES) startMin = DAY_MINUTES - spanMin;
  return { startMin, endMin: startMin + spanMin };
}

// Tightest free gap that still fits `durationMin`, so a short task doesn't eat a long open
// stretch. Returns undefined when nothing fits.
export function bestFitGap(gaps: { startMin: number; endMin: number }[], durationMin: number): { startMin: number; endMin: number } | undefined {
  let best: { startMin: number; endMin: number } | undefined;
  for (const g of gaps) {
    const length = g.endMin - g.startMin;
    if (length < durationMin) continue;
    if (!best || length < best.endMin - best.startMin) best = g;
  }
  return best;
}

// Monday..Sunday of the week containing `dateStr`, as YYYY-MM-DD strings.
export function weekDates(dateStr: string): string[] {
  const d = new Date(`${dateStr}T00:00:00`);
  const mondayOffset = (d.getDay() + 6) % 7;
  const monday = addDays(dateStr, -mondayOffset);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

const CYCLE_HINT: Record<string, string> = {
  Menstrual: "Period days are often lower energy. A lighter schedule may feel kinder.",
  Follicular: "Energy often rises through this stretch, a good time for bigger tasks.",
  Ovulation: "Around your estimated fertile window. Keep a little buffer between blocks.",
  Luteal: "Later in the cycle, energy can dip. Leaving some space in the afternoon can help.",
};

// A gentle, estimated note for the day based on logged period starts. Returns null when there
// isn't enough logged history to estimate, so the page shows nothing rather than a guess.
export function cycleHintFor(entries: LogEntry[], dateStr: string): string | null {
  const { avgCycleDays } = predictNextCycle(entries);
  const avgPeriodDays = computeAvgPeriodDays(entries);
  if (!avgCycleDays || !avgPeriodDays) return null;
  const lastStart = entries
    .filter((e) => e.data.event === "period_start" && e.date <= dateStr)
    .map((e) => e.date)
    .sort()
    .pop();
  if (!lastStart) return null;
  const { phase } = estimatePhase(dateStr, lastStart, avgCycleDays, avgPeriodDays);
  return CYCLE_HINT[phase] ?? null;
}

export interface ScheduledItem {
  id: string;
  name: string;
  timeOfDay?: string;
  estimatedMinutes?: number;
  daysOfWeek?: number[];
}

// An item with no days set runs every day, same convention as appliesOnDate.
function sharesWeekday(a: number[] | undefined, b: number[] | undefined): boolean {
  const aDays = a && a.length > 0 ? a : ALL_DAYS;
  const bDays = b && b.length > 0 ? b : ALL_DAYS;
  return aDays.some((d) => bDays.includes(d));
}

// Other timed items whose time window overlaps the candidate's on a shared weekday. Items
// missing a time or duration are skipped, since there's no window to clash with.
export function findClashes(candidate: ScheduledItem, others: ScheduledItem[]): ScheduledItem[] {
  const start = parseHm(candidate.timeOfDay);
  if (start === undefined || !candidate.estimatedMinutes) return [];
  const end = start + candidate.estimatedMinutes;
  return others.filter((o) => {
    const otherStart = parseHm(o.timeOfDay);
    if (otherStart === undefined || !o.estimatedMinutes) return false;
    const otherEnd = otherStart + o.estimatedMinutes;
    return start < otherEnd && otherStart < end && sharesWeekday(candidate.daysOfWeek, o.daysOfWeek);
  });
}
