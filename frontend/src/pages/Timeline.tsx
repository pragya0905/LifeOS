import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, Clock, Minus, Plus } from "lucide-react";
import { useApi } from "../api/useApi";
import { Card } from "../components/Card";
import { Icon } from "../components/Icon";
import { MedicationStatusButtons } from "../components/MedicationStatusButtons";
import { useToast } from "../components/Toast";
import { input, mutedText, pageTitle, sectionLabel } from "../components/ui";
import { addDays, computeDueAtUtc, isValidDateStr, todayLocal } from "../lib/date";
import { getMoonEventsInRange, MOON_EVENT_LABEL } from "../lib/moonPhase";
import { medicationStatusLabel, routineStatusLabel } from "../lib/statusDisplay";
import {
  assignLanes,
  bestFitGap,
  buildTimeline,
  cycleHintFor,
  DAY_MINUTES,
  findFreeGaps,
  findOverlaps,
  formatDuration,
  MEAL_NOMINAL_MIN,
  parseHm,
  totalsByKind,
  viewportFor,
  weekDates,
  type TimelineBlock,
  type TimelineKind,
  type TimelineSource,
  type UnscheduledItem,
} from "../lib/timeline";
import type { HabitLog, LogEntry, Medication, MealPlanSlot, MedicationLog, MedicationLogStatus, RoutineStepLog, RoutineTemplate, Task } from "../types";

// Shared horizontal line (see mockups/b5/timeline-B.html): every visible block sits on one line
// and only takes a second row when it overlaps another in time. Colour codes the kind.

// Which kinds exist and in what order they're listed — colour is looked up separately via
// kindColors below, so every kind can be recoloured without touching this list.
const KINDS: { kind: TimelineKind; label: string }[] = [
  { kind: "sleep", label: "Sleep" },
  { kind: "routine", label: "Routines" },
  { kind: "med", label: "Meds" },
  { kind: "meal", label: "Meals" },
  { kind: "task", label: "Tasks" },
  { kind: "workout", label: "Workouts" },
  { kind: "call", label: "Calls" },
];

// Any colour, via the native picker — not a curated palette. The earlier contrast problem
// (white text on a solid amber/bloom/purple fill, ~2.7:1) came from letting the *text* sit
// directly on a saturated colour; that's structurally impossible here, because the picked hex
// only ever becomes a low-alpha tint behind the block (see hexAlpha/kindBlockStyle below) and
// the left-rule border — text stays the fixed ink/paper colour always. So any hex the user
// picks is safe by construction, no vetting needed.
const DEFAULT_KIND_COLORS: Record<TimelineKind, string> = {
  sleep: "#7a6fb0",
  routine: "#2b8f8a",
  med: "#4a63e0",
  meal: "#c26a8f",
  task: "#d98b2b",
  workout: "#2e9960",
  call: "#5b7290",
};

const KIND_COLORS_KEY = "lifeos.timeline.kindColors";
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// True alpha compositing, so the same value naturally reads as a pale tint over the light
// theme's paper-card and a muted tint over the dark theme's ink-bg-card — no separate
// light/dark tuning needed, unlike a flat (non-transparent) colour swap would.
function hexAlpha(hex: string, alphaHex: string): string {
  return HEX_RE.test(hex) ? `${hex}${alphaHex}` : hex;
}

function kindBlockStyle(hex: string): CSSProperties {
  return { backgroundColor: hexAlpha(hex, "3d"), borderLeftColor: hex };
}

function readKindColors(): Record<TimelineKind, string> {
  try {
    const raw = localStorage.getItem(KIND_COLORS_KEY);
    if (!raw) return DEFAULT_KIND_COLORS;
    const parsed = JSON.parse(raw) as Partial<Record<TimelineKind, string>>;
    const next = { ...DEFAULT_KIND_COLORS };
    // Merge over the defaults rather than trusting the stored object shape — a kind added
    // after someone last customized their colours still gets a sensible default, and a
    // malformed/legacy value (e.g. an old named-palette key) is dropped rather than applied.
    for (const kind of Object.keys(next) as TimelineKind[]) {
      const value = parsed[kind];
      if (value && HEX_RE.test(value)) next[kind] = value;
    }
    return next;
  } catch {
    return DEFAULT_KIND_COLORS;
  }
}

// Meal plan slots carry no clock time of their own (see TimelineSource.meals' comment in
// lib/timeline.ts), so where they land on the chart is only ever a per-device display
// preference — stored the same way as the colour picker, never sent to the backend.
const MEAL_TYPES: { type: string; label: string }[] = [
  { type: "breakfast", label: "Breakfast" },
  { type: "lunch", label: "Lunch" },
  { type: "snack", label: "Snack" },
  { type: "dinner", label: "Dinner" },
];
const DEFAULT_MEAL_TIMES: Record<string, string> = { breakfast: "08:00", lunch: "13:00", snack: "16:00", dinner: "19:00" };
const MEAL_TIMES_KEY = "lifeos.timeline.mealTimes";

function readMealTimes(): Record<string, string> {
  try {
    const raw = localStorage.getItem(MEAL_TIMES_KEY);
    if (!raw) return DEFAULT_MEAL_TIMES;
    const parsed = JSON.parse(raw) as Partial<Record<string, string>>;
    const next = { ...DEFAULT_MEAL_TIMES };
    for (const type of Object.keys(next)) {
      const value = parsed[type];
      if (value && parseHm(value) !== undefined) next[type] = value;
    }
    return next;
  } catch {
    return DEFAULT_MEAL_TIMES;
  }
}

// A protected task (deep work, commute — time set aside, not a to-do) gets its own accent —
// deliberately the neutral surface tone, not a category colour, since it isn't one, and not
// customizable for the same reason. Uses real Tailwind dark: tokens (unlike the hex-based
// kinds above) because this one never varies, so there's no reason not to.
const PROTECTED_BORDER = "border-l-ink-muted dark:border-l-mist-muted";
const PROTECTED_BG = "bg-stone dark:bg-stone-dark";

// Static background bands so morning, afternoon, evening and night read at a glance.
const ZONES: { fromHour: number; toHour: number; color: string }[] = [
  { fromHour: 0, toHour: 6, color: "bg-stone/30" },
  { fromHour: 6, toHour: 12, color: "bg-amber/10" },
  { fromHour: 12, toHour: 18, color: "bg-bloom/10" },
  { fromHour: 18, toHour: 24, color: "bg-routine/10" },
];

const ZOOM_LEVELS = [24, 6, 2] as const;
type Zoom = (typeof ZOOM_LEVELS)[number];

// Fixed scale per hour, so the day is wider than the phone and scrolls sideways.
const PX_PER_HOUR: Record<Zoom, number> = { 24: 96, 6: 200, 2: 400 };

const SUB_ROW_PX = 58;
// A short block (a 2-minute medication, say) used to floor out at 44px — barely enough for
// 3-4 letters before the title truncated to something like "Gl…". DESIGN.md: never truncate
// text the user needs to read. A Gantt block can't wrap the way a list row can without also
// growing taller, so the fix here is width instead — wide enough that most real titles
// ("Morning routine", "Glutone 1000") show in full regardless of how short the block's actual
// duration is. The chart already scrolls sideways, so a block reading wider than its true
// duration costs nothing.
const MIN_BLOCK_WIDTH = 150;
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CYCLE_HINT_KEY = "lifeos.timeline.cycleHints";

// Protected blocks use real Tailwind classes (fixed, theme-aware); every other kind uses an
// inline style built from its user-picked hex (see kindBlockStyle) since Tailwind can't
// generate a utility class for a colour it doesn't know about until runtime.
function colorFor(block: TimelineBlock, kindColors: Record<TimelineKind, string>): { className: string; style?: CSSProperties } {
  if (block.protected) return { className: `${PROTECTED_BORDER} ${PROTECTED_BG}` };
  return { className: "", style: kindBlockStyle(kindColors[block.kind]) };
}

// Every horizontal position is a percentage of the full-day width, so a zoomed chart is just
// a wider inner box that the container scrolls to the right spot.
function pctOfDay(min: number): number {
  return (min / DAY_MINUTES) * 100;
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function hhmm(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function readCycleHintsOn(): boolean {
  try {
    return localStorage.getItem(CYCLE_HINT_KEY) === "on";
  } catch {
    return false;
  }
}

interface TimelineData {
  routines: RoutineTemplate[];
  medications: Medication[];
  tasks: Task[];
  sleep: LogEntry[];
  cycle: LogEntry[];
  meals: MealPlanSlot[];
  habits: HabitLog[];
  calls: LogEntry[];
  routineLogs: RoutineStepLog[];
  medicationLogs: MedicationLog[];
}

export default function Timeline() {
  const { request } = useApi();
  const { show: showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const realToday = todayLocal();
  const dateParam = searchParams.get("date");
  const selectedDate = dateParam && isValidDateStr(dateParam) ? dateParam : realToday;
  const isToday = selectedDate === realToday;

  const [data, setData] = useState<TimelineData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Zoom>(24);
  const [filters, setFilters] = useState<Record<TimelineKind, boolean>>({ sleep: true, routine: true, med: true, meal: true, task: true, workout: true, call: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => nowMinutes());
  const [cycleHintsOn, setCycleHintsOn] = useState<boolean>(readCycleHintsOn);
  const [kindColors, setKindColors] = useState<Record<TimelineKind, string>>(readKindColors);
  const [customizingColors, setCustomizingColors] = useState(false);
  const [mealTimes, setMealTimes] = useState<Record<string, string>>(readMealTimes);
  const [customizingMealTimes, setCustomizingMealTimes] = useState(false);
  const [suggestions, setSuggestions] = useState<{ id: string; startMin: number }[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [reflection, setReflection] = useState<string | null>(null);
  const [reflecting, setReflecting] = useState(false);
  const [reflectError, setReflectError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(nowMinutes()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!dateParam || isValidDateStr(dateParam)) return;
    setSearchParams({}, { replace: true });
  }, [dateParam, setSearchParams]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setData(null);
    setError(null);
    Promise.all([
      request<{ routines: RoutineTemplate[] }>("/routines", { signal }),
      request<{ medications: Medication[] }>("/medications", { signal }),
      request<{ tasks: Task[] }>("/tasks", { signal }),
      request<{ entries: LogEntry[] }>(`/logs?logType=sleep&from=${selectedDate}&to=${selectedDate}`, { signal }),
      request<{ entries: LogEntry[] }>("/logs?logType=cycle", { signal }),
      request<{ slots: MealPlanSlot[] }>(`/meal-plan?from=${selectedDate}&to=${selectedDate}`, { signal }),
      request<{ habits: HabitLog[] }>(`/habits/${selectedDate}`, { signal }),
      request<{ entries: LogEntry[] }>(`/logs?logType=call&from=${selectedDate}&to=${selectedDate}`, { signal }),
      request<{ logs: RoutineStepLog[] }>(`/routine-logs/${selectedDate}`, { signal }),
      request<{ logs: MedicationLog[] }>(`/medication-logs/${selectedDate}`, { signal }),
    ])
      .then(([routines, medications, tasks, sleep, cycle, meals, habits, calls, routineLogs, medicationLogs]) => {
        setData({
          routines: routines.routines,
          medications: medications.medications,
          tasks: tasks.tasks,
          sleep: sleep.entries,
          cycle: cycle.entries,
          meals: meals.slots,
          habits: habits.habits,
          calls: calls.entries,
          routineLogs: routineLogs.logs,
          medicationLogs: medicationLogs.logs,
        });
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        setError(err instanceof Error ? err.message : "Couldn't load your timeline");
      });
    return () => controller.abort();
    // `request` is recreated each render; the date is the only real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // Everything the layout needs, derived from the fetched data.
  const source = useMemo<TimelineSource | null>(() => {
    if (!data) return null;
    return {
      routines: data.routines,
      medications: data.medications,
      tasks: data.tasks.map((t) => ({ taskId: t.taskId, title: t.title, dueDate: t.dueDate, dueTime: t.dueTime, scheduleTime: t.scheduleTime, estimatedHours: t.estimatedHours, status: t.status, blockType: t.blockType })),
      sleep: data.sleep.map((e) => ({
        logId: e.logId,
        bedTime: typeof e.data.bedTime === "string" ? e.data.bedTime : undefined,
        wakeTime: typeof e.data.wakeTime === "string" ? e.data.wakeTime : undefined,
      })),
      meals: data.meals.map((m) => ({ mealType: m.mealType, text: m.text })),
      workout: (() => {
        const exercise = data.habits.find((h) => h.habitType === "exercise");
        return exercise ? { startTime: exercise.startTime, minutes: exercise.value } : undefined;
      })(),
      calls: data.calls.map((c) => ({
        logId: c.logId,
        personName: typeof c.data.personName === "string" ? c.data.personName : "Unknown",
        startTime: typeof c.data.startTime === "string" ? c.data.startTime : undefined,
        durationMinutes: typeof c.data.durationMinutes === "number" ? c.data.durationMinutes : undefined,
      })),
    };
  }, [data]);

  // Converted once per change, not per render; falls back to the built-in default minute for
  // any meal type the user hasn't customized (or whose stored value somehow failed to parse).
  const mealMinutes = useMemo(() => {
    const out = { ...MEAL_NOMINAL_MIN };
    for (const { type } of MEAL_TYPES) {
      const parsed = parseHm(mealTimes[type]);
      if (parsed !== undefined) out[type] = parsed;
    }
    return out;
  }, [mealTimes]);

  const built = useMemo(
    () => (source ? buildTimeline(source, new Date(`${selectedDate}T00:00:00`), selectedDate, mealMinutes) : null),
    [source, selectedDate, mealMinutes],
  );

  // Plain-text status per block, so each block says Done / Taken / Skipped as well as its colour.
  const statusById = useMemo(() => {
    const out: Record<string, string> = {};
    if (!data) return out;
    for (const m of data.medications) {
      const log = data.medicationLogs.find((l) => l.medicationId === m.medicationId);
      if (log) out[`med:${m.medicationId}`] = medicationStatusLabel(log.status, log.note);
    }
    for (const r of data.routines) {
      const logs = data.routineLogs.filter((l) => l.routineId === r.routineId);
      if (r.steps.length > 0 && logs.length > 0) {
        const done = logs.filter((l) => l.status === "done").length;
        out[`routine:${r.routineId}`] = `${done} of ${r.steps.length} done`;
      }
    }
    for (const t of data.tasks) if (t.status === "done") out[`task:${t.taskId}`] = "✓ Done";
    return out;
  }, [data]);

  const blocks = useMemo<TimelineBlock[]>(() => (built ? built.blocks.map((b) => ({ ...b, status: statusById[b.id] })) : []), [built, statusById]);
  const unscheduled = built?.unscheduled ?? [];
  const visibleBlocks = useMemo(() => blocks.filter((b) => filters[b.kind]), [blocks, filters]);
  // MIN_BLOCK_WIDTH is a pixel floor, but lane packing works in minutes — converted at the
  // current zoom's scale so two short blocks close together in real time (but not literally
  // overlapping) still get pushed to separate lanes once each is wide enough to visually
  // collide. Recomputed per zoom level since px-per-minute changes with it.
  const minVisualGapMin = (MIN_BLOCK_WIDTH / PX_PER_HOUR[zoom]) * 60;
  // Sleep sits in its own band above the shared line: it's background, not something to plan
  // around, so waking at a medication's time isn't treated as a clash.
  const sleepPacked = useMemo(
    () => assignLanes(visibleBlocks.filter((b) => b.kind === "sleep").map((b) => ({ ...b })), minVisualGapMin),
    [visibleBlocks, minVisualGapMin],
  );
  const sleepRows = Math.max(1, ...sleepPacked.map((b) => b.lane + 1));
  // Re-packed over only the visible blocks, so hiding a kind never leaves an empty row behind.
  const packed = useMemo(
    () => assignLanes(visibleBlocks.filter((b) => b.kind !== "sleep").map((b) => ({ ...b })), minVisualGapMin),
    [visibleBlocks, minVisualGapMin],
  );
  const packedRows = Math.max(1, ...packed.map((b) => b.lane + 1));
  const expanded = packed.find((b) => b.id === selectedId);

  const totals = useMemo(() => totalsByKind(blocks), [blocks]);
  const gaps = useMemo(() => findFreeGaps(blocks), [blocks]);
  const overlaps = useMemo(() => findOverlaps(blocks.filter((b) => b.kind !== "sleep")), [blocks]);

  // Week strip: routines, meds and tasks per day. Sleep and meals are only fetched for the
  // viewed day, so they're left out of the other days' counts.
  const weekCounts = useMemo(() => {
    if (!source) return [];
    const planned = { ...source, sleep: [], meals: [] };
    return weekDates(selectedDate).map((d) => {
      const r = buildTimeline(planned, new Date(`${d}T00:00:00`), d);
      return { date: d, count: r.blocks.length + r.unscheduled.length };
    });
  }, [source, selectedDate]);

  const moonToday = useMemo(() => {
    const start = new Date(`${selectedDate}T00:00:00`);
    return getMoonEventsInRange(start, new Date(start.getTime() + 24 * 60 * 60 * 1000)).get(selectedDate);
  }, [selectedDate]);

  const cycleHint = data && cycleHintsOn ? cycleHintFor(data.cycle, selectedDate) : null;

  const vp = viewportFor(zoom, isToday ? now : 12 * 60);
  const innerWidthPx = PX_PER_HOUR[zoom] * 24;

  // Bring the zoomed window into view when the zoom level or date changes. Not tied to the
  // minute tick, so a swipe made by the user isn't snapped back every minute.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = (vp.startMin / 60) * PX_PER_HOUR[zoom];
    // vp.startMin is derived from the zoom level and the date only at the moment of change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, selectedDate]);

  const showNow = isToday;

  function goToDate(next: string) {
    setSelectedId(null);
    setSearchParams(next === realToday ? {} : { date: next });
  }

  function toggleFilter(kind: TimelineKind) {
    setFilters((prev) => ({ ...prev, [kind]: !prev[kind] }));
  }

  function toggleCycleHints() {
    setCycleHintsOn((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(CYCLE_HINT_KEY, next ? "on" : "off");
      } catch {
        // Storage can be blocked; the toggle still works for this visit.
      }
      return next;
    });
  }

  // Per-device only (localStorage), same as the cycle-hints toggle — this is a display
  // preference, not data, so it never touches the backend.
  function setKindColor(kind: TimelineKind, paletteKey: string) {
    setKindColors((prev) => {
      const next = { ...prev, [kind]: paletteKey };
      try {
        localStorage.setItem(KIND_COLORS_KEY, JSON.stringify(next));
      } catch {
        // Storage can be blocked; the change still applies for this visit.
      }
      return next;
    });
  }

  function setMealTime(type: string, time: string) {
    setMealTimes((prev) => {
      const next = { ...prev, [type]: time };
      try {
        localStorage.setItem(MEAL_TIMES_KEY, JSON.stringify(next));
      } catch {
        // Storage can be blocked; the change still applies for this visit.
      }
      return next;
    });
  }

  // ---- Status mutations (optimistic, Undo toast, rollback on failure) ----

  async function setMedStatus(medicationId: string, status: MedicationLogStatus, note?: string) {
    if (!data) return;
    const prevLog = data.medicationLogs.find((l) => l.medicationId === medicationId);
    const medName = data.medications.find((m) => m.medicationId === medicationId)?.name ?? "Medication";
    const replace = (logs: MedicationLog[], next: MedicationLog) => [...logs.filter((l) => l.medicationId !== medicationId), next];
    const optimistic: MedicationLog = {
      userId: prevLog?.userId ?? "",
      dateMedicationId: `${selectedDate}#${medicationId}`,
      date: selectedDate,
      medicationId,
      status,
      note: note || undefined,
      source: "manual",
      createdAt: prevLog?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const snapshot = data;
    setData({ ...data, medicationLogs: replace(data.medicationLogs, optimistic) });
    try {
      const saved = await request<MedicationLog>(`/medication-logs/${selectedDate}/${medicationId}`, {
        method: "PATCH",
        body: JSON.stringify({ status, note: note ?? "" }),
      });
      setData((prev) => prev && { ...prev, medicationLogs: replace(prev.medicationLogs, saved) });
    } catch {
      setData(snapshot);
      showToast("Something went wrong — that change wasn't saved");
      return;
    }
    showToast(`${medName}: ${medicationStatusLabel(status, note)}`, {
      undo: () => {
        request<MedicationLog>(`/medication-logs/${selectedDate}/${medicationId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: prevLog?.status ?? "missed", note: prevLog?.note ?? "" }),
        })
          .then((reverted) => setData((prev) => prev && { ...prev, medicationLogs: replace(prev.medicationLogs, reverted) }))
          .catch(() => {});
      },
    });
  }

  async function setTaskDone(task: Task) {
    if (!data) return;
    const snapshot = data;
    setData({ ...data, tasks: data.tasks.map((t) => (t.taskId === task.taskId ? { ...t, status: "done" } : t)) });
    try {
      await request<Task>(`/tasks/${task.taskId}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) });
    } catch {
      setData(snapshot);
      showToast("Something went wrong — that change wasn't saved");
      return;
    }
    showToast(`"${task.title}" done`, {
      undo: () => {
        request<Task>(`/tasks/${task.taskId}`, { method: "PATCH", body: JSON.stringify({ status: task.status }) })
          .then((reverted) => setData((prev) => prev && { ...prev, tasks: prev.tasks.map((t) => (t.taskId === reverted.taskId ? reverted : t)) }))
          .catch(() => {});
      },
    });
  }

  async function setRoutineStepStatus(routine: RoutineTemplate, stepIndex: number, status: RoutineStepLog["status"], note?: string) {
    if (!data) return;
    const prevLog = data.routineLogs.find((l) => l.routineId === routine.routineId && l.stepIndex === stepIndex);
    const replace = (logs: RoutineStepLog[], next: RoutineStepLog) => [
      ...logs.filter((l) => !(l.routineId === next.routineId && l.stepIndex === next.stepIndex)),
      next,
    ];
    const optimistic: RoutineStepLog = {
      userId: prevLog?.userId ?? "",
      dateRoutineStep: `${selectedDate}#${routine.routineId}#${stepIndex}`,
      date: selectedDate,
      routineId: routine.routineId,
      stepIndex,
      status,
      note: note || undefined,
      source: "manual",
      createdAt: prevLog?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const snapshot = data;
    setData({ ...data, routineLogs: replace(data.routineLogs, optimistic) });
    try {
      const saved = await request<RoutineStepLog>(`/routine-logs/${selectedDate}/${routine.routineId}/${stepIndex}`, {
        method: "PATCH",
        body: JSON.stringify({ status, note: note ?? "" }),
      });
      setData((prev) => prev && { ...prev, routineLogs: replace(prev.routineLogs, saved) });
    } catch {
      setData(snapshot);
      showToast("Something went wrong — that change wasn't saved");
      return;
    }
    showToast(`${routine.name}: ${routineStatusLabel(status, note)}`, {
      undo: () => {
        request<RoutineStepLog>(`/routine-logs/${selectedDate}/${routine.routineId}/${stepIndex}`, {
          method: "PATCH",
          body: JSON.stringify({ status: prevLog?.status ?? "skipped", note: prevLog?.note ?? "" }),
        })
          .then((reverted) => setData((prev) => prev && { ...prev, routineLogs: replace(prev.routineLogs, reverted) }))
          .catch(() => {});
      },
    });
  }

  // ---- Moving things in time (visible Move control; no drag) ----

  async function moveRoutine(routine: RoutineTemplate, time: string) {
    if (!data) return;
    const snapshot = data;
    const previous = routine.timeOfDay;
    setData({ ...data, routines: data.routines.map((r) => (r.routineId === routine.routineId ? { ...r, timeOfDay: time } : r)) });
    try {
      const saved = await request<RoutineTemplate>(`/routines/${routine.routineId}`, { method: "PATCH", body: JSON.stringify({ timeOfDay: time }) });
      setData((prev) => prev && { ...prev, routines: prev.routines.map((r) => (r.routineId === saved.routineId ? saved : r)) });
    } catch {
      setData(snapshot);
      showToast("Something went wrong — that change wasn't saved");
      return;
    }
    showToast(`${routine.name} moved to ${time}`, {
      undo: previous
        ? () => {
            request<RoutineTemplate>(`/routines/${routine.routineId}`, { method: "PATCH", body: JSON.stringify({ timeOfDay: previous }) })
              .then((reverted) => setData((prev) => prev && { ...prev, routines: prev.routines.map((r) => (r.routineId === reverted.routineId ? reverted : r)) }))
              .catch(() => {});
          }
        : undefined,
    });
  }

  // Shared by Move (a task already has a time) and Fit this task (a task with no time yet).
  async function setTaskTime(task: Task, time: string, successMessage: string) {
    if (!data) return;
    const snapshot = data;
    const previous = { dueTime: task.dueTime, dueAtUtc: task.dueAtUtc };
    const dueAtUtc = task.dueDate ? computeDueAtUtc(task.dueDate, time) : undefined;
    setData({ ...data, tasks: data.tasks.map((t) => (t.taskId === task.taskId ? { ...t, dueTime: time, dueAtUtc } : t)) });
    try {
      const saved = await request<Task>(`/tasks/${task.taskId}`, { method: "PATCH", body: JSON.stringify({ dueTime: time, dueAtUtc }) });
      setData((prev) => prev && { ...prev, tasks: prev.tasks.map((t) => (t.taskId === saved.taskId ? saved : t)) });
    } catch {
      setData(snapshot);
      showToast("Something went wrong — that change wasn't saved");
      return;
    }
    showToast(successMessage, {
      undo: previous.dueTime
        ? () => {
            request<Task>(`/tasks/${task.taskId}`, { method: "PATCH", body: JSON.stringify(previous) })
              .then((reverted) => setData((prev) => prev && { ...prev, tasks: prev.tasks.map((t) => (t.taskId === reverted.taskId ? reverted : t)) }))
              .catch(() => {});
          }
        : undefined,
    });
  }

  // Duration learning: Start/Finished write the ISO instants the comparison is based on; the
  // estimate itself is only ever changed by an explicit tap on "Update to Xm?". Shares the
  // same optimistic + rollback-on-failure shape as every other mutation here. Undo is only
  // offered when every touched field actually had a prior value — same rule moveRoutine and
  // setTaskTime already follow — since a PATCH that sends only undefined fields is rejected
  // by the server as "no updatable fields provided" rather than clearing them.
  async function patchRoutine(routine: RoutineTemplate, patch: Record<string, unknown>, successMessage?: string) {
    if (!data) return;
    const snapshot = data;
    const previous = Object.fromEntries(Object.keys(patch).map((key) => [key, (routine as unknown as Record<string, unknown>)[key]]));
    const canUndo = Object.values(previous).every((v) => v !== undefined);
    setData({ ...data, routines: data.routines.map((r) => (r.routineId === routine.routineId ? { ...r, ...patch } : r)) });
    try {
      const saved = await request<RoutineTemplate>(`/routines/${routine.routineId}`, { method: "PATCH", body: JSON.stringify(patch) });
      setData((prev) => prev && { ...prev, routines: prev.routines.map((r) => (r.routineId === saved.routineId ? saved : r)) });
    } catch {
      setData(snapshot);
      showToast("Something went wrong — that change wasn't saved");
      return;
    }
    if (!successMessage) return;
    showToast(successMessage, {
      undo: canUndo
        ? () => {
            request<RoutineTemplate>(`/routines/${routine.routineId}`, { method: "PATCH", body: JSON.stringify(previous) })
              .then((reverted) => setData((prev) => prev && { ...prev, routines: prev.routines.map((r) => (r.routineId === reverted.routineId ? reverted : r)) }))
              .catch(() => {});
          }
        : undefined,
    });
  }

  function startRoutine(routine: RoutineTemplate) {
    patchRoutine(routine, { lastStartedAt: new Date().toISOString() }, `${routine.name} started`);
  }

  function finishRoutine(routine: RoutineTemplate) {
    patchRoutine(routine, { lastCompletedAt: new Date().toISOString() }, `${routine.name} finished`);
  }

  function updateEstimate(routine: RoutineTemplate, minutes: number) {
    patchRoutine(routine, { estimatedMinutes: minutes }, `${routine.name}: estimate updated to ${formatDuration(minutes)}`);
  }

  // Planned/done counts across the kinds that actually carry a status, scoped to items that
  // apply today (scheduled or unscheduled) — used for the daily reflection request. Never sent
  // with titles or notes, only these two counts.
  const dayProgress = useMemo(() => {
    if (!data || !built) return { planned: 0, done: 0 };
    let planned = 0;
    let done = 0;
    const isTracked = (id: string) => built.blocks.some((b) => b.id === id) || built.unscheduled.some((u) => u.id === id);
    for (const r of data.routines) {
      if (!isTracked(`routine:${r.routineId}`)) continue;
      planned += 1;
      const logs = data.routineLogs.filter((l) => l.routineId === r.routineId);
      if (r.steps.length > 0 && logs.filter((l) => l.status === "done").length === r.steps.length) done += 1;
    }
    for (const m of data.medications) {
      if (!isTracked(`med:${m.medicationId}`)) continue;
      planned += 1;
      if (data.medicationLogs.find((l) => l.medicationId === m.medicationId)?.status === "taken") done += 1;
    }
    for (const t of data.tasks) {
      if (t.dueDate !== selectedDate) continue;
      planned += 1;
      if (t.status === "done") done += 1;
    }
    return { planned, done };
  }, [data, built, selectedDate]);

  // Auto-arrange: sends only unscheduled tasks that already have an estimate, plus the day's
  // free gaps, to /timeline/suggest. The server re-checks every returned placement against
  // those same gaps, so nothing here is trusted blindly either.
  async function requestSuggestions() {
    if (!data) return;
    const fittable = unscheduled
      .map((item) => {
        if (item.kind !== "task" || item.reason !== "no time set") return null;
        const task = taskById(item.id.replace(/^task:/, ""));
        return task && task.estimatedHours !== undefined
          ? { id: item.id, title: item.title, estimatedMinutes: Math.round(task.estimatedHours * 60) }
          : null;
      })
      .filter((x): x is { id: string; title: string; estimatedMinutes: number } => x !== null);
    if (fittable.length === 0 || gaps.length === 0) {
      setSuggestions([]);
      return;
    }
    setSuggesting(true);
    setSuggestError(null);
    try {
      const result = await request<{ placements: { id: string; startMin: number }[] }>("/timeline/suggest", {
        method: "POST",
        body: JSON.stringify({ items: fittable, gaps }),
      });
      setSuggestions(result.placements);
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : "Couldn't get suggestions");
    } finally {
      setSuggesting(false);
    }
  }

  function acceptSuggestion(id: string, startMin: number) {
    const task = taskById(id.replace(/^task:/, ""));
    if (!task) return;
    setTaskTime(task, hhmm(startMin), `"${task.title}" placed at ${hhmm(startMin)}`);
    setSuggestions((prev) => prev?.filter((p) => p.id !== id) ?? null);
  }

  function rejectSuggestion(id: string) {
    setSuggestions((prev) => prev?.filter((p) => p.id !== id) ?? null);
  }

  // Daily reflection: one sentence generated on demand from counts only (never titles, notes,
  // or health/cycle detail) — nothing here is stored, and it isn't requested automatically.
  async function requestReflection() {
    setReflecting(true);
    setReflectError(null);
    try {
      const result = await request<{ reflection: string | null }>("/timeline/reflect", {
        method: "POST",
        body: JSON.stringify({
          plannedCount: dayProgress.planned,
          doneCount: dayProgress.done,
          sleepMinutes: totals.sleep,
          routineMinutes: totals.routine,
          taskMinutes: totals.task,
        }),
      });
      setReflection(result.reflection);
    } catch (err) {
      setReflectError(err instanceof Error ? err.message : "Couldn't generate a reflection");
    } finally {
      setReflecting(false);
    }
  }

  const taskById = (id: string) => data?.tasks.find((t) => t.taskId === id);

  return (
    <div className="mx-auto mt-6 w-full max-w-2xl px-4 pb-24">
      <h1 className={pageTitle}>Timeline</h1>

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => goToDate(addDays(selectedDate, -1))} aria-label="Previous day" className="flex min-h-10 min-w-10 items-center justify-center rounded-control border border-stone dark:border-stone-dark">
          <Icon icon={ChevronLeft} size={18} />
        </button>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => e.target.value && isValidDateStr(e.target.value) && goToDate(e.target.value)}
          className="min-h-10 flex-1 rounded-control border border-stone bg-paper-card px-3 text-sm tabular-nums dark:border-stone-dark dark:bg-ink-bg-card"
        />
        <button type="button" onClick={() => goToDate(addDays(selectedDate, 1))} aria-label="Next day" className="flex min-h-10 min-w-10 items-center justify-center rounded-control border border-stone dark:border-stone-dark">
          <Icon icon={ChevronRight} size={18} />
        </button>
        {!isToday && (
          <button type="button" onClick={() => goToDate(realToday)} className="min-h-10 rounded-control border border-stone px-3 text-sm dark:border-stone-dark">
            Today
          </button>
        )}
      </div>

      {weekCounts.length > 0 && (
        <div className="mt-3 grid grid-cols-7 gap-1">
          {weekCounts.map(({ date, count }, i) => {
            const isSelected = date === selectedDate;
            return (
              <button
                key={date}
                type="button"
                onClick={() => goToDate(date)}
                aria-pressed={isSelected}
                aria-label={`${WEEKDAY_SHORT[i]} ${date}, ${count} planned`}
                className={`flex min-h-12 flex-col items-center justify-center rounded-control border text-[11px] tabular-nums ${isSelected ? "border-bloom bg-bloom text-paper-card" : "border-stone dark:border-stone-dark"} ${date === realToday && !isSelected ? "font-semibold text-bloom" : ""}`}
              >
                <span>
                  {WEEKDAY_SHORT[i]} {Number(date.slice(8))}
                </span>
                <span className="opacity-80">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {KINDS.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            aria-pressed={filters[kind]}
            onClick={() => toggleFilter(kind)}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${filters[kind] ? "border-bloom bg-bloom text-paper-card" : "border-stone text-ink-muted dark:border-stone-dark dark:text-mist-muted"}`}
          >
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: kindColors[kind] }} />
            {label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={customizingColors}
          onClick={() => setCustomizingColors((v) => !v)}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${customizingColors ? "border-bloom bg-bloom text-paper-card" : "border-stone text-ink-muted dark:border-stone-dark dark:text-mist-muted"}`}
        >
          Customise colours
        </button>
        <button
          type="button"
          aria-pressed={customizingMealTimes}
          onClick={() => setCustomizingMealTimes((v) => !v)}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${customizingMealTimes ? "border-bloom bg-bloom text-paper-card" : "border-stone text-ink-muted dark:border-stone-dark dark:text-mist-muted"}`}
        >
          Meal times
        </button>
      </div>

      {customizingMealTimes && (
        <Card className="mt-2 flex flex-col gap-3 p-3">
          {MEAL_TYPES.map(({ type, label }) => {
            const isDefault = mealTimes[type] === DEFAULT_MEAL_TIMES[type];
            return (
              <div key={type} className="flex items-center gap-3">
                <input
                  type="time"
                  value={mealTimes[type]}
                  onChange={(e) => e.target.value && setMealTime(type, e.target.value)}
                  aria-label={`${label} time`}
                  className={`w-32 ${input}`}
                />
                <p className="min-w-0 flex-1 text-sm text-ink dark:text-paper">{label}</p>
                {!isDefault && (
                  <button
                    type="button"
                    onClick={() => setMealTime(type, DEFAULT_MEAL_TIMES[type])}
                    className="min-h-10 shrink-0 rounded-control border border-stone px-2 text-xs text-ink-muted dark:border-stone-dark dark:text-mist-muted"
                  >
                    Reset
                  </button>
                )}
              </div>
            );
          })}
          <p className="text-xs text-ink-muted dark:text-mist-muted">
            Meals have no time of their own in the meal plan, so this is only where they're drawn on the chart. Saved on this device only; edit what's actually planned on the{" "}
            <Link to="/meal-plan" className="text-bloom underline">Meal Plan</Link> page.
          </p>
        </Card>
      )}

      {customizingColors && (
        <Card className="mt-2 flex flex-col gap-3 p-3">
          {KINDS.map(({ kind, label }) => {
            const isDefault = kindColors[kind] === DEFAULT_KIND_COLORS[kind];
            return (
              <div key={kind} className="flex items-center gap-3">
                <input
                  type="color"
                  value={kindColors[kind]}
                  onChange={(e) => setKindColor(kind, e.target.value)}
                  aria-label={`${label} colour`}
                  className="h-10 w-14 shrink-0 cursor-pointer rounded-control border border-stone bg-transparent p-1 dark:border-stone-dark"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink dark:text-paper">{label}</p>
                  <p className="text-xs uppercase tabular-nums text-ink-muted dark:text-mist-muted">{kindColors[kind]}</p>
                </div>
                {!isDefault && (
                  <button
                    type="button"
                    onClick={() => setKindColor(kind, DEFAULT_KIND_COLORS[kind])}
                    className="min-h-10 shrink-0 rounded-control border border-stone px-2 text-xs text-ink-muted dark:border-stone-dark dark:text-mist-muted"
                  >
                    Reset
                  </button>
                )}
              </div>
            );
          })}
          <p className="text-xs text-ink-muted dark:text-mist-muted">Tap a swatch to open the full colour picker. Saved on this device only.</p>
        </Card>
      )}

      {error && <p className="mt-4 text-sm text-alert">{error}</p>}
      {!data && !error && <p className={`mt-6 ${mutedText}`}>Loading...</p>}

      {built && (
        <>
          <p className="mt-4 text-sm tabular-nums text-ink dark:text-paper">
            Sleep {formatDuration(totals.sleep)} · Routines {formatDuration(totals.routine)} · Meds {formatDuration(totals.med)} · Meals {formatDuration(totals.meal)} · Tasks {formatDuration(totals.task)}
            {totals.workout > 0 && <> · Workout {formatDuration(totals.workout)}</>}
            {totals.call > 0 && <> · Calls {formatDuration(totals.call)}</>}
          </p>

          {moonToday && <p className="mt-1 text-sm text-ink-muted dark:text-mist-muted">{MOON_EVENT_LABEL[moonToday]} today</p>}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" aria-pressed={cycleHintsOn} onClick={toggleCycleHints} className={`min-h-10 rounded-full border px-3 text-xs font-medium ${cycleHintsOn ? "border-bloom bg-bloom text-paper-card" : "border-stone text-ink-muted dark:border-stone-dark dark:text-mist-muted"}`}>
              Cycle hints {cycleHintsOn ? "on" : "off"}
            </button>
          </div>
          {cycleHint && (
            <Card className="mt-2 border-l-4 border-l-bloom p-3 text-sm text-ink dark:text-paper">
              {cycleHint} <span className="text-xs text-ink-muted dark:text-mist-muted">(estimate)</span>
            </Card>
          )}

          <div className="mt-3 flex items-center gap-2">
            <span className={sectionLabel}>Zoom</span>
            <button type="button" onClick={() => setZoom(ZOOM_LEVELS[Math.min(ZOOM_LEVELS.indexOf(zoom) + 1, ZOOM_LEVELS.length - 1)])} aria-label="Zoom out" className="flex min-h-10 min-w-10 items-center justify-center rounded-control border border-stone dark:border-stone-dark">
              <Icon icon={Minus} size={16} />
            </button>
            {ZOOM_LEVELS.map((z) => (
              <button key={z} type="button" aria-pressed={zoom === z} onClick={() => setZoom(z)} className={`min-h-10 min-w-10 rounded-control border px-2 text-xs tabular-nums ${zoom === z ? "border-bloom bg-bloom text-paper-card" : "border-stone dark:border-stone-dark"}`}>
                {z === 24 ? "24h" : `${z}h`}
              </button>
            ))}
            <button type="button" onClick={() => setZoom(ZOOM_LEVELS[Math.max(ZOOM_LEVELS.indexOf(zoom) - 1, 0)])} aria-label="Zoom in" className="flex min-h-10 min-w-10 items-center justify-center rounded-control border border-stone dark:border-stone-dark">
              <Icon icon={Plus} size={16} />
            </button>
          </div>

          <div ref={scrollRef} className="mt-3 overflow-x-auto rounded-control border border-stone dark:border-stone-dark" aria-label="24-hour timeline">
            <div className="relative" style={{ width: `${innerWidthPx}px` }}>
              {/* Taller than a single text row on purpose: the "now" badge lives in the top
                  half and the hour ticks in the bottom half, so the two never land on top of
                  each other no matter what time it is — they used to share one row and
                  collide whenever "now" fell near an hour mark. */}
              <div className="relative h-11 border-b border-stone text-[11px] tabular-nums text-ink-muted dark:border-stone-dark dark:text-mist-muted">
                {Array.from({ length: 24 }, (_, h) => (
                  <span key={h} className="absolute bottom-1 -translate-x-1/2" style={{ left: `${pctOfDay(h * 60)}%` }}>
                    {String(h).padStart(2, "0")}
                  </span>
                ))}
              </div>

              {ZONES.map((z) => (
                <div
                  key={z.fromHour}
                  aria-hidden="true"
                  className={`pointer-events-none absolute bottom-0 top-11 ${z.color}`}
                  style={{ left: `${pctOfDay(z.fromHour * 60)}%`, width: `${pctOfDay((z.toHour - z.fromHour) * 60)}%` }}
                />
              ))}

              {sleepPacked.length > 0 && (
                <div className="relative border-b border-stone dark:border-stone-dark" style={{ height: sleepRows * SUB_ROW_PX + 8 }}>
                  {sleepPacked.map((b) => (
                    <SleepBlock key={b.id} block={b} hex={kindColors.sleep} />
                  ))}
                </div>
              )}

              {/* One shared line: blocks sit side by side until two of them overlap in time, and only then take a second row. */}
              <div className="relative border-b border-stone dark:border-stone-dark">
                {packed.map((b) => (
                  <BlockButton key={b.id} block={b} color={colorFor(b, kindColors)} selected={selectedId === b.id} onSelect={() => setSelectedId(selectedId === b.id ? null : b.id)} />
                ))}
                <div style={{ height: packedRows * SUB_ROW_PX + 8 }} />
                {expanded && (
                  // Expands in place under the tapped block, so the details sit on the same line.
                  <div className="relative pb-2" style={{ marginLeft: `${pctOfDay(expanded.startMin)}%`, width: 280, maxWidth: "100%" }}>
                    <SelectedPanel
                      block={expanded}
                      data={data!}
                      selectedDate={selectedDate}
                      onMed={setMedStatus}
                      onTask={setTaskDone}
                      onRoutineStep={setRoutineStepStatus}
                      stepStatus={(routineId, stepIndex) => data?.routineLogs.find((l) => l.routineId === routineId && l.stepIndex === stepIndex)}
                      onMoveRoutine={moveRoutine}
                      onMoveTask={(task, time) => setTaskTime(task, time, `"${task.title}" moved to ${time}`)}
                      onStartRoutine={startRoutine}
                      onFinishRoutine={finishRoutine}
                      onUpdateEstimate={updateEstimate}
                    />
                  </div>
                )}
              </div>

              {gaps.map((g) => (
                // overflow-hidden so the sticky label is clipped to this gap's own width —
                // without it, a label wider than a narrow gap could visually spill into
                // whatever block sits right after it.
                <div
                  key={`${g.startMin}-${g.endMin}`}
                  className="pointer-events-none absolute top-11 bottom-0 overflow-hidden"
                  style={{ left: `${pctOfDay(g.startMin)}%`, width: `${pctOfDay(g.endMin - g.startMin)}%` }}
                >
                  <span className="sticky left-1 top-1 inline-block max-w-full truncate whitespace-nowrap bg-paper/70 px-1 text-[10px] text-ink-muted dark:text-mist-muted">
                    {formatDuration(g.endMin - g.startMin)} free
                  </span>
                </div>
              ))}

              {showNow && (
                // Pinned to the top half of the (now taller) ruler, the hour ticks live in
                // the bottom half — so this never lands on top of an hour label, and it
                // doesn't cut vertically through the lanes below.
                <div className="pointer-events-none absolute top-1 z-20 -translate-x-1/2" style={{ left: `${pctOfDay(now)}%` }} aria-label={`Now ${hhmm(now)}`}>
                  <span className="rounded bg-bloom px-1 text-[10px] font-medium tabular-nums text-paper-card">{hhmm(now)}</span>
                </div>
              )}
            </div>
          </div>
          {zoom !== 24 && <p className="mt-1 text-[11px] text-ink-muted dark:text-mist-muted">Swipe sideways to see the rest of the day.</p>}

          {overlaps.length > 0 && (
            <Card className="mt-3 space-y-1 border-l-4 border-l-amber p-3">
              {overlaps.map(([a, b]) => (
                <p key={`${a.id}-${b.id}`} className="text-xs text-amber-ink dark:text-amber-ink-dark">
                  ⚠ {a.title} ({hhmm(a.startMin)}) overlaps {b.title} ({hhmm(b.startMin)})
                </p>
              ))}
            </Card>
          )}

          <div className={`mt-6 ${sectionLabel}`}>Suggestions</div>
          <Card className="border-l-4 border-l-bloom p-3">
            {suggestions === null && (
              <button type="button" disabled={suggesting} onClick={requestSuggestions} className="min-h-10 w-full rounded-control border border-stone text-sm font-medium disabled:opacity-60 dark:border-stone-dark">
                {suggesting ? "Thinking..." : "Suggest placements for unscheduled tasks"}
              </button>
            )}
            {suggestError && <p className="mt-2 text-xs text-alert">{suggestError}</p>}
            {suggestions !== null && suggestions.length === 0 && (
              <p className={mutedText}>No fitting placement found right now — add an estimate to an unscheduled task, or open up some free time.</p>
            )}
            {suggestions !== null && suggestions.length > 0 && (
              <ul className="flex flex-col gap-2">
                {suggestions.map((sug) => {
                  const task = taskById(sug.id.replace(/^task:/, ""));
                  if (!task) return null;
                  return (
                    <li key={sug.id} className="flex items-center justify-between gap-2 rounded-control border border-stone px-3 py-2 text-sm dark:border-stone-dark">
                      <span className="break-words text-ink dark:text-paper">
                        {task.title} <span className="tabular-nums text-ink-muted dark:text-mist-muted">at {hhmm(sug.startMin)}</span>
                      </span>
                      <span className="flex shrink-0 gap-1.5">
                        <button type="button" onClick={() => acceptSuggestion(sug.id, sug.startMin)} className="min-h-10 rounded-control bg-bloom px-3 text-xs font-medium text-paper-card">
                          Accept
                        </button>
                        <button type="button" onClick={() => rejectSuggestion(sug.id)} className="min-h-10 rounded-control border border-stone px-3 text-xs dark:border-stone-dark">
                          Reject
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <div className={`mt-6 ${sectionLabel}`}>Unscheduled</div>
          <UnscheduledList
            items={unscheduled}
            gaps={gaps}
            taskFor={taskById}
            onPlace={(task, startMin) => setTaskTime(task, hhmm(startMin), `"${task.title}" placed at ${hhmm(startMin)}`)}
          />
          {unscheduled.length > 0 && (
            <p className="mt-2 text-xs text-ink-muted dark:text-mist-muted">
              These have no time or duration, so they aren't placed on the chart. Add one on the <Link to="/routines" className="text-bloom underline">Routines</Link> or <Link to="/tasks" className="text-bloom underline">Tasks</Link> page.
            </p>
          )}

          <div className={`mt-6 ${sectionLabel}`}>Reflection</div>
          <Card className="border-l-4 border-l-bloom p-3">
            {reflection === null && (
              <button type="button" disabled={reflecting} onClick={requestReflection} className="min-h-10 w-full rounded-control border border-stone text-sm font-medium disabled:opacity-60 dark:border-stone-dark">
                {reflecting ? "Thinking..." : "How did today go?"}
              </button>
            )}
            {reflectError && <p className="mt-2 text-xs text-alert">{reflectError}</p>}
            {reflection && <p className="text-sm text-ink dark:text-paper">{reflection}</p>}
          </Card>
        </>
      )}
    </div>
  );
}

function BlockButton({
  block,
  color,
  selected,
  onSelect,
}: {
  block: TimelineBlock;
  color: { className: string; style?: CSSProperties };
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`absolute z-10 overflow-hidden rounded-control border border-l-4 border-stone px-1.5 py-1 text-left leading-tight shadow-sm dark:border-stone-dark ${color.className} ${selected ? "ring-2 ring-bloom" : ""}`}
      style={{ ...color.style, left: `${pctOfDay(block.startMin)}%`, width: `${pctOfDay(block.endMin - block.startMin)}%`, top: block.lane * SUB_ROW_PX + 22, height: SUB_ROW_PX - 6, minWidth: MIN_BLOCK_WIDTH }}
    >
      <span className="block truncate text-xs font-medium text-ink dark:text-paper">{block.title}</span>
      <span className="block text-[11px] tabular-nums text-ink-muted dark:text-mist-muted">
        {hhmm(block.startMin)}–{hhmm(block.endMin)}
      </span>
      {block.protected ? (
        <span className="block truncate text-[11px] text-ink-muted dark:text-mist-muted">Protected</span>
      ) : (
        block.status && <span className="block truncate text-[11px] text-ink-muted dark:text-mist-muted">{block.status}</span>
      )}
    </button>
  );
}

// Sleep is read-only here (it's logged from the Today screen), so it's a plain block, not a button.
// Sleep's hex comes straight from kindColors.sleep — it's never "protected", so no className
// branch is needed here the way BlockButton needs one.
function SleepBlock({ block, hex }: { block: TimelineBlock; hex: string }) {
  return (
    <div
      className="absolute z-10 overflow-hidden rounded-control border border-l-4 border-stone px-1.5 py-1 leading-tight shadow-sm dark:border-stone-dark"
      style={{ ...kindBlockStyle(hex), left: `${pctOfDay(block.startMin)}%`, width: `${pctOfDay(block.endMin - block.startMin)}%`, top: block.lane * SUB_ROW_PX + 6, height: SUB_ROW_PX - 12, minWidth: MIN_BLOCK_WIDTH }}
    >
      <span className="block truncate text-xs font-medium text-ink dark:text-paper">{block.title}</span>
      <span className="block text-[11px] tabular-nums text-ink-muted dark:text-mist-muted">
        {hhmm(block.startMin)}–{hhmm(block.endMin)}
      </span>
    </div>
  );
}

// Move: a visible button that reveals a time picker. Used instead of drag so it works on touch
// without long-press, and so the change is explicit.
function MoveControl({ current, onSave }: { current?: string; onSave: (time: string) => void }) {
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState(current ?? "");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setTime(current ?? "");
          setOpen(true);
        }}
        className="flex min-h-10 w-full items-center justify-center gap-2 rounded-control border border-stone text-sm font-medium dark:border-stone-dark"
      >
        <Icon icon={Clock} size={14} />
        Move
      </button>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <input
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        aria-label="New time"
        className="min-h-10 flex-1 rounded-control border border-stone bg-paper-card px-2 text-sm tabular-nums dark:border-stone-dark dark:bg-ink-bg-card"
      />
      <button
        type="button"
        disabled={!time || time === current}
        onClick={() => {
          onSave(time);
          setOpen(false);
        }}
        className="min-h-10 rounded-control bg-bloom px-3 text-xs font-medium text-paper-card disabled:opacity-50"
      >
        Save time
      </button>
      <button type="button" onClick={() => setOpen(false)} className="min-h-10 rounded-control border border-stone px-3 text-xs dark:border-stone-dark">
        Cancel
      </button>
    </div>
  );
}

// Deterministic, no AI call: compares the elapsed time between the last Start and Finished
// tap against the routine's own estimate, and offers to update it when they're meaningfully
// apart (at least 5 min and at least 20%). The estimate is never changed without a tap.
function RoutineDurationLearning({
  routine,
  onStart,
  onFinish,
  onAcceptEstimate,
}: {
  routine: RoutineTemplate;
  onStart: (routine: RoutineTemplate) => void;
  onFinish: (routine: RoutineTemplate) => void;
  onAcceptEstimate: (routine: RoutineTemplate, minutes: number) => void;
}) {
  const inProgress = !!routine.lastStartedAt && (!routine.lastCompletedAt || routine.lastCompletedAt < routine.lastStartedAt);
  const actualMinutes =
    routine.lastStartedAt && routine.lastCompletedAt && routine.lastCompletedAt > routine.lastStartedAt
      ? Math.round((new Date(routine.lastCompletedAt).getTime() - new Date(routine.lastStartedAt).getTime()) / 60000)
      : null;
  const estimate = routine.estimatedMinutes;
  const showLearning =
    actualMinutes !== null &&
    estimate !== undefined &&
    Math.abs(actualMinutes - estimate) >= 5 &&
    Math.abs(actualMinutes - estimate) / estimate >= 0.2;

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex gap-2">
        <button type="button" onClick={() => onStart(routine)} className="min-h-10 flex-1 rounded-control border border-stone text-xs font-medium dark:border-stone-dark">
          {inProgress ? "Restart" : "Start"}
        </button>
        {inProgress && (
          <button type="button" onClick={() => onFinish(routine)} className="min-h-10 flex-1 rounded-control bg-bloom text-xs font-medium text-paper-card">
            Finished
          </button>
        )}
      </div>
      {showLearning && actualMinutes !== null && estimate !== undefined && (
        <p className="text-xs text-ink-muted dark:text-mist-muted">
          Last time this took {formatDuration(actualMinutes)}, estimate is {formatDuration(estimate)}.{" "}
          <button type="button" onClick={() => onAcceptEstimate(routine, actualMinutes)} className="font-medium text-bloom underline">
            Update to {formatDuration(actualMinutes)}?
          </button>
        </p>
      )}
    </div>
  );
}

function SelectedPanel({
  block,
  data,
  selectedDate,
  onMed,
  onTask,
  onRoutineStep,
  stepStatus,
  onMoveRoutine,
  onMoveTask,
  onStartRoutine,
  onFinishRoutine,
  onUpdateEstimate,
}: {
  block: TimelineBlock;
  data: TimelineData;
  selectedDate: string;
  onMed: (medicationId: string, status: MedicationLogStatus, note?: string) => void;
  onTask: (task: Task) => void;
  onRoutineStep: (routine: RoutineTemplate, stepIndex: number, status: RoutineStepLog["status"], note?: string) => void;
  stepStatus: (routineId: string, stepIndex: number) => RoutineStepLog | undefined;
  onMoveRoutine: (routine: RoutineTemplate, time: string) => void;
  onMoveTask: (task: Task, time: string) => void;
  onStartRoutine: (routine: RoutineTemplate) => void;
  onFinishRoutine: (routine: RoutineTemplate) => void;
  onUpdateEstimate: (routine: RoutineTemplate, minutes: number) => void;
}) {
  const header = (
    <p className="text-sm font-medium text-ink dark:text-paper">
      {block.title} <span className="tabular-nums text-ink-muted dark:text-mist-muted">{hhmm(block.startMin)}–{hhmm(block.endMin)}</span>
    </p>
  );
  const shell = "rounded-control border border-stone bg-paper-card p-3 dark:border-stone-dark dark:bg-ink-bg-card";

  if (block.kind === "med") {
    const medId = block.id.replace(/^med:/, "");
    const log = data.medicationLogs.find((l) => l.medicationId === medId);
    return (
      <div className={shell}>
        {header}
        <div className="mt-2">
          <MedicationStatusButtons status={log?.status ?? null} note={log?.note} pending={false} showAddNote={selectedDate <= todayLocal()} onSetStatus={(status, note) => onMed(medId, status, note)} />
        </div>
      </div>
    );
  }

  if (block.kind === "task") {
    const taskId = block.id.replace(/^task:/, "");
    const task = data.tasks.find((t) => t.taskId === taskId);
    if (!task) return null;
    const isDone = task.status === "done";
    return (
      <div className={shell}>
        {header}
        {block.protected && (
          <p className="mt-1 text-xs text-ink-muted dark:text-mist-muted">Protected time — set aside, not a to-do to tick off.</p>
        )}
        <div className="mt-2 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onTask(task)}
            disabled={isDone}
            aria-pressed={isDone}
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-control border border-stone text-sm font-medium disabled:opacity-60 dark:border-stone-dark"
          >
            {isDone && <Icon icon={Check} size={14} />}
            {isDone ? "Done" : "Mark done"}
          </button>
          {task.dueDate && <MoveControl current={task.dueTime} onSave={(time) => onMoveTask(task, time)} />}
        </div>
      </div>
    );
  }

  if (block.kind === "routine") {
    const routineId = block.id.replace(/^routine:/, "");
    const routine = data.routines.find((r) => r.routineId === routineId);
    if (!routine) return null;
    return (
      <div className={shell}>
        {header}
        <ul className="mt-2 space-y-2">
          {routine.steps.map((step, i) => {
            const s = stepStatus(routine.routineId, i);
            return (
              <li key={i} className="text-sm">
                <p className="break-words text-ink dark:text-paper">{step}</p>
                <div className="mt-1 flex gap-1.5">
                  <StepButton active={s?.status === "done"} label="Done" onClick={() => onRoutineStep(routine, i, "done")} />
                  <StepButton active={s?.status === "skipped"} label="Skipped" onClick={() => onRoutineStep(routine, i, "skipped")} />
                  <StepButton active={s?.status === "not_applicable"} label="N/A" onClick={() => onRoutineStep(routine, i, "not_applicable")} />
                </div>
              </li>
            );
          })}
        </ul>
        <RoutineDurationLearning routine={routine} onStart={onStartRoutine} onFinish={onFinishRoutine} onAcceptEstimate={onUpdateEstimate} />
        <div className="mt-3">
          <MoveControl current={routine.timeOfDay} onSave={(time) => onMoveRoutine(routine, time)} />
        </div>
      </div>
    );
  }

  if (block.kind === "workout" || block.kind === "call") {
    return (
      <div className={shell}>
        {header}
        <p className="mt-1 text-xs text-ink-muted dark:text-mist-muted">
          {block.kind === "workout" ? "Logged from Today's habits." : "Logged from Today's call entry."}
        </p>
      </div>
    );
  }

  if (block.kind === "meal") {
    return (
      <div className={shell}>
        {header}
        <p className="mt-1 text-xs text-ink-muted dark:text-mist-muted">Meal times are placed at a standard slot. Edit the plan on the Meal Plan page.</p>
      </div>
    );
  }

  // Sleep: read-only here; it's logged from the Today screen.
  return <div className={shell}>{header}</div>;
}

function StepButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-10 flex-1 rounded-control border text-xs font-medium ${active ? "border-bloom bg-bloom text-paper-card" : "border-stone text-ink-muted dark:border-stone-dark dark:text-mist-muted"}`}
    >
      {label}
    </button>
  );
}

// Fit this task: finds the tightest free gap that holds the task's estimate, then places it at
// the gap's start. Only tasks with an estimate can be fitted; the rest say what's missing.
function UnscheduledList({
  items,
  gaps,
  taskFor,
  onPlace,
}: {
  items: UnscheduledItem[];
  gaps: { startMin: number; endMin: number }[];
  taskFor: (id: string) => Task | undefined;
  onPlace: (task: Task, startMin: number) => void;
}) {
  const [fitId, setFitId] = useState<string | null>(null);

  if (items.length === 0) return <p className={mutedText}>Everything has a time.</p>;

  return (
    <ul className="divide-y divide-stone rounded-control border border-stone dark:divide-stone-dark dark:border-stone-dark">
      {items.map((item) => {
        const task = item.kind === "task" ? taskFor(item.id.replace(/^task:/, "")) : undefined;
        const canFit = !!task && item.reason === "no time set" && task.estimatedHours !== undefined;
        const minutes = canFit && task ? Math.round((task.estimatedHours ?? 0) * 60) : 0;
        const best = canFit ? bestFitGap(gaps, minutes) : undefined;
        const open = fitId === item.id;
        return (
          <li key={item.id} className="px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="break-words text-ink dark:text-paper">{item.title}</span>
              <span className="shrink-0 text-xs text-ink-muted dark:text-mist-muted">{item.reason}</span>
            </div>
            {canFit && !open && (
              <button type="button" onClick={() => setFitId(item.id)} className="mt-2 min-h-10 rounded-control border border-stone px-3 text-xs font-medium dark:border-stone-dark">
                Fit this task
              </button>
            )}
            {canFit && open && (
              <div className="mt-2 space-y-2">
                {best && task ? (
                  <>
                    <p className="text-xs text-ink-muted dark:text-mist-muted">
                      Best fit {hhmm(best.startMin)}–{hhmm(best.endMin)} ({formatDuration(best.endMin - best.startMin)} free) for {formatDuration(minutes)}
                    </p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => onPlace(task, best.startMin)} className="min-h-10 flex-1 rounded-control bg-bloom text-xs font-medium text-paper-card">
                        Place at {hhmm(best.startMin)}
                      </button>
                      <button type="button" onClick={() => setFitId(null)} className="min-h-10 rounded-control border border-stone px-3 text-xs dark:border-stone-dark">
                        Close
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-ink-muted dark:text-mist-muted">No free gap is long enough for {formatDuration(minutes)}.</p>
                )}
              </div>
            )}
            {item.kind === "task" && item.reason === "no time set" && task && task.estimatedHours === undefined && (
              <p className="mt-1 text-xs text-ink-muted dark:text-mist-muted">Add an estimate on the Tasks page to fit it.</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
