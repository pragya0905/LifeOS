import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, Clock, Minus, Plus } from "lucide-react";
import { useApi } from "../api/useApi";
import { Icon } from "../components/Icon";
import { MedicationStatusButtons } from "../components/MedicationStatusButtons";
import { useToast } from "../components/Toast";
import { mutedText, pageTitle, sectionLabel } from "../components/ui";
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
  totalsByKind,
  viewportFor,
  weekDates,
  type TimelineBlock,
  type TimelineKind,
  type TimelineSource,
  type UnscheduledItem,
} from "../lib/timeline";
import type { LogEntry, Medication, MealPlanSlot, MedicationLog, MedicationLogStatus, RoutineStepLog, RoutineTemplate, Task } from "../types";

// Shared horizontal line (see mockups/b5/timeline-B.html): every visible block sits on one line
// and only takes a second row when it overlaps another in time. Colour codes the kind.

const LANES: { kind: TimelineKind; label: string; color: string }[] = [
  { kind: "sleep", label: "Sleep", color: "bg-[#7a6fb0]" },
  { kind: "routine", label: "Routines", color: "bg-routine" },
  { kind: "med", label: "Meds", color: "bg-medication" },
  { kind: "meal", label: "Meals", color: "bg-[#c26a8f]" },
  { kind: "task", label: "Tasks", color: "bg-amber" },
];

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
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CYCLE_HINT_KEY = "lifeos.timeline.cycleHints";

function colorFor(kind: TimelineKind): string {
  return LANES.find((l) => l.kind === kind)?.color ?? "bg-stone";
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
  const [filters, setFilters] = useState<Record<TimelineKind, boolean>>({ sleep: true, routine: true, med: true, meal: true, task: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => nowMinutes());
  const [cycleHintsOn, setCycleHintsOn] = useState<boolean>(readCycleHintsOn);
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
      request<{ logs: RoutineStepLog[] }>(`/routine-logs/${selectedDate}`, { signal }),
      request<{ logs: MedicationLog[] }>(`/medication-logs/${selectedDate}`, { signal }),
    ])
      .then(([routines, medications, tasks, sleep, cycle, meals, routineLogs, medicationLogs]) => {
        setData({
          routines: routines.routines,
          medications: medications.medications,
          tasks: tasks.tasks,
          sleep: sleep.entries,
          cycle: cycle.entries,
          meals: meals.slots,
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
      tasks: data.tasks.map((t) => ({ taskId: t.taskId, title: t.title, dueDate: t.dueDate, dueTime: t.dueTime, scheduleTime: t.scheduleTime, estimatedHours: t.estimatedHours, status: t.status })),
      sleep: data.sleep.map((e) => ({
        logId: e.logId,
        bedTime: typeof e.data.bedTime === "string" ? e.data.bedTime : undefined,
        wakeTime: typeof e.data.wakeTime === "string" ? e.data.wakeTime : undefined,
      })),
      meals: data.meals.map((m) => ({ mealType: m.mealType, text: m.text })),
    };
  }, [data]);

  const built = useMemo(() => (source ? buildTimeline(source, new Date(`${selectedDate}T00:00:00`), selectedDate) : null), [source, selectedDate]);

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
  // Sleep sits in its own band above the shared line: it's background, not something to plan
  // around, so waking at a medication's time isn't treated as a clash.
  const sleepPacked = useMemo(() => assignLanes(visibleBlocks.filter((b) => b.kind === "sleep").map((b) => ({ ...b }))), [visibleBlocks]);
  const sleepRows = Math.max(1, ...sleepPacked.map((b) => b.lane + 1));
  // Re-packed over only the visible blocks, so hiding a kind never leaves an empty row behind.
  const packed = useMemo(() => assignLanes(visibleBlocks.filter((b) => b.kind !== "sleep").map((b) => ({ ...b }))), [visibleBlocks]);
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
        {LANES.map(({ kind, label, color }) => (
          <button
            key={kind}
            type="button"
            aria-pressed={filters[kind]}
            onClick={() => toggleFilter(kind)}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${filters[kind] ? "border-bloom bg-bloom text-paper-card" : "border-stone text-ink-muted dark:border-stone-dark dark:text-mist-muted"}`}
          >
            <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />
            {label}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-alert">{error}</p>}
      {!data && !error && <p className={`mt-6 ${mutedText}`}>Loading...</p>}

      {built && (
        <>
          <p className="mt-4 text-sm tabular-nums text-ink dark:text-paper">
            Sleep {formatDuration(totals.sleep)} · Routines {formatDuration(totals.routine)} · Meds {formatDuration(totals.med)} · Meals {formatDuration(totals.meal)} · Tasks {formatDuration(totals.task)}
          </p>

          {moonToday && <p className="mt-1 text-sm text-ink-muted dark:text-mist-muted">{MOON_EVENT_LABEL[moonToday]} today</p>}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" aria-pressed={cycleHintsOn} onClick={toggleCycleHints} className={`min-h-10 rounded-full border px-3 text-xs font-medium ${cycleHintsOn ? "border-bloom bg-bloom text-paper-card" : "border-stone text-ink-muted dark:border-stone-dark dark:text-mist-muted"}`}>
              Cycle hints {cycleHintsOn ? "on" : "off"}
            </button>
          </div>
          {cycleHint && (
            <p className="mt-2 rounded-control border-l-[3px] border-bloom bg-paper-card px-3 py-2 text-sm text-ink dark:bg-ink-bg-card dark:text-paper">
              {cycleHint} <span className="text-xs text-ink-muted dark:text-mist-muted">(estimate)</span>
            </p>
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
              <div className="relative h-7 border-b border-stone text-[11px] tabular-nums text-ink-muted dark:border-stone-dark dark:text-mist-muted">
                {Array.from({ length: 24 }, (_, h) => (
                  <span key={h} className="absolute top-1 -translate-x-1/2" style={{ left: `${pctOfDay(h * 60)}%` }}>
                    {String(h).padStart(2, "0")}
                  </span>
                ))}
              </div>

              {ZONES.map((z) => (
                <div
                  key={z.fromHour}
                  aria-hidden="true"
                  className={`pointer-events-none absolute bottom-0 top-7 ${z.color}`}
                  style={{ left: `${pctOfDay(z.fromHour * 60)}%`, width: `${pctOfDay((z.toHour - z.fromHour) * 60)}%` }}
                />
              ))}

              {sleepPacked.length > 0 && (
                <div className="relative border-b border-stone dark:border-stone-dark" style={{ height: sleepRows * SUB_ROW_PX + 8 }}>
                  {sleepPacked.map((b) => (
                    <SleepBlock key={b.id} block={b} />
                  ))}
                </div>
              )}

              {/* One shared line: blocks sit side by side until two of them overlap in time, and only then take a second row. */}
              <div className="relative border-b border-stone dark:border-stone-dark">
                {packed.map((b) => (
                  <BlockButton key={b.id} block={b} color={colorFor(b.kind)} selected={selectedId === b.id} onSelect={() => setSelectedId(selectedId === b.id ? null : b.id)} />
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
                    />
                  </div>
                )}
              </div>

              {gaps.map((g) => (
                <div
                  key={`${g.startMin}-${g.endMin}`}
                  className="pointer-events-none absolute top-7 bottom-0"
                  style={{ left: `${pctOfDay(g.startMin)}%`, width: `${pctOfDay(g.endMin - g.startMin)}%` }}
                >
                  <span className="sticky left-1 top-8 inline-block whitespace-nowrap bg-paper/70 px-1 text-[10px] text-ink-muted dark:text-mist-muted">
                    {formatDuration(g.endMin - g.startMin)} free
                  </span>
                </div>
              ))}

              {showNow && (
                // Lives in the hour ruler only, so it doesn't cut vertically through the lanes.
                <div className="pointer-events-none absolute top-0 z-20 flex h-7 -translate-x-1/2 items-center" style={{ left: `${pctOfDay(now)}%` }} aria-label={`Now ${hhmm(now)}`}>
                  <span className="rounded bg-bloom px-1 text-[10px] font-medium tabular-nums text-paper-card">{hhmm(now)}</span>
                </div>
              )}
            </div>
          </div>
          {zoom !== 24 && <p className="mt-1 text-[11px] text-ink-muted dark:text-mist-muted">Swipe sideways to see the rest of the day.</p>}

          {overlaps.length > 0 && (
            <div className="mt-3 space-y-1">
              {overlaps.map(([a, b]) => (
                <p key={`${a.id}-${b.id}`} className="text-xs text-amber-ink dark:text-amber-ink-dark">
                  ⚠ {a.title} ({hhmm(a.startMin)}) overlaps {b.title} ({hhmm(b.startMin)})
                </p>
              ))}
            </div>
          )}

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
  color: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`absolute z-10 overflow-hidden rounded-control border px-1.5 py-1 text-left leading-tight text-paper-card ${color} ${selected ? "border-ink ring-2 ring-bloom dark:border-paper" : "border-transparent"}`}
      style={{ left: `${pctOfDay(block.startMin)}%`, width: `${pctOfDay(block.endMin - block.startMin)}%`, top: block.lane * SUB_ROW_PX + 22, height: SUB_ROW_PX - 6, minWidth: 44 }}
    >
      <span className="block truncate text-xs font-medium">{block.title}</span>
      <span className="block text-[11px] tabular-nums opacity-90">
        {hhmm(block.startMin)}–{hhmm(block.endMin)}
      </span>
      {block.status && <span className="block truncate text-[11px] opacity-90">{block.status}</span>}
    </button>
  );
}

// Sleep is read-only here (it's logged from the Today screen), so it's a plain block, not a button.
function SleepBlock({ block }: { block: TimelineBlock }) {
  return (
    <div
      className="absolute z-10 overflow-hidden rounded-control px-1.5 py-1 leading-tight text-paper-card bg-[#7a6fb0]"
      style={{ left: `${pctOfDay(block.startMin)}%`, width: `${pctOfDay(block.endMin - block.startMin)}%`, top: block.lane * SUB_ROW_PX + 6, height: SUB_ROW_PX - 12, minWidth: 44 }}
    >
      <span className="block truncate text-xs font-medium">{block.title}</span>
      <span className="block text-[11px] tabular-nums opacity-90">
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
        <div className="mt-3">
          <MoveControl current={routine.timeOfDay} onSave={(time) => onMoveRoutine(routine, time)} />
        </div>
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
