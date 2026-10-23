import { appliesOnDate } from "./weekdays";

// Pure layout logic for the 24h timeline page. Everything here works in minutes-from-midnight
// on a single local calendar date, so it can be tested without a DOM or a network.

export const DAY_MINUTES = 24 * 60;

export type TimelineKind = "sleep" | "routine" | "med" | "task";

export interface TimelineBlock {
  id: string;
  kind: TimelineKind;
  title: string;
  startMin: number;
  endMin: number;
  // Lane index assigned by assignLanes(); blocks that overlap in time get different lanes.
  lane: number;
  // Whether this block's end wraps past midnight (sleep only). The page draws the
  // continuation on the same day as a separate segment with `continuesFromPrevious`.
  continuesFromPrevious?: boolean;
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
  tasks: { taskId: string; title: string; dueDate?: string; dueTime?: string; scheduleTime?: string; estimatedHours?: number; status: string }[];
  // Sleep logs for the date, as stored: bedTime/wakeTime are "HH:MM" and either may be missing.
  sleep: { logId: string; bedTime?: string; wakeTime?: string }[];
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
    pushTimed(blocks, unscheduled, { id: `task:${t.taskId}`, kind: "task", title: t.title, start, duration });
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
  const totals: Record<TimelineKind, number> = { sleep: 0, routine: 0, med: 0, task: 0 };
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
