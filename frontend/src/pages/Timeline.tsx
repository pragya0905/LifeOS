import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { useApi } from "../api/useApi";
import { MedicationStatusButtons } from "../components/MedicationStatusButtons";
import { useToast } from "../components/Toast";
import { Icon } from "../components/Icon";
import { addDays, isValidDateStr, todayLocal } from "../lib/date";
import { medicationStatusLabel, routineStatusLabel } from "../lib/statusDisplay";
import {
  assignLanes,
  buildTimeline,
  DAY_MINUTES,
  findFreeGaps,
  findOverlaps,
  formatDuration,
  totalsByKind,
  viewportFor,
  type TimelineBlock,
  type TimelineKind,
  type TimelineSource,
  type UnscheduledItem,
} from "../lib/timeline";
import type { LogEntry, MedicationLog, MedicationLogStatus, Medication, RoutineStepLog, RoutineTemplate, Task } from "../types";
import { mutedText, pageTitle, sectionLabel } from "../components/ui";

// Horizontal 24h lanes (Option B of mockups/b5/timeline-B.html): one lane per kind, swipe
// sideways when zoomed, the coral line marks "now". Overlaps inside a kind stack in sub-rows.

const LANES: { kind: TimelineKind; label: string; color: string }[] = [
  { kind: "sleep", label: "Sleep", color: "bg-[#7a6fb0]" },
  { kind: "routine", label: "Routines", color: "bg-routine" },
  { kind: "med", label: "Meds", color: "bg-medication" },
  { kind: "task", label: "Tasks", color: "bg-amber" },
];

const ZOOM_LEVELS = [24, 6, 2] as const;
type Zoom = (typeof ZOOM_LEVELS)[number];

// Fixed scale per hour, so the day is wider than the phone and scrolls sideways. Each zoom
// step is a bigger scale; the 24h overview is ~1500px wide, enough for readable block labels.
const PX_PER_HOUR: Record<Zoom, number> = { 24: 64, 6: 160, 2: 320 };

const SUB_ROW_PX = 54;

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

interface TimelineData {
  routines: RoutineTemplate[];
  medications: Medication[];
  tasks: Task[];
  sleep: LogEntry[];
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
  const dateObj = new Date(`${selectedDate}T00:00:00`);

  const [data, setData] = useState<TimelineData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Zoom>(24);
  const [filters, setFilters] = useState<Record<TimelineKind, boolean>>({ sleep: true, routine: true, med: true, task: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => nowMinutes());
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
      request<{ logs: RoutineStepLog[] }>(`/routine-logs/${selectedDate}`, { signal }),
      request<{ logs: MedicationLog[] }>(`/medication-logs/${selectedDate}`, { signal }),
    ])
      .then(([routines, medications, tasks, sleep, routineLogs, medicationLogs]) => {
        setData({
          routines: routines.routines,
          medications: medications.medications,
          tasks: tasks.tasks,
          sleep: sleep.entries,
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

  const built = useMemo(() => {
    if (!data) return null;
    const source: TimelineSource = {
      routines: data.routines,
      medications: data.medications,
      tasks: data.tasks.map((t) => ({ taskId: t.taskId, title: t.title, dueDate: t.dueDate, dueTime: t.dueTime, scheduleTime: t.scheduleTime, estimatedHours: t.estimatedHours, status: t.status })),
      sleep: data.sleep.map((e) => ({
        logId: e.logId,
        bedTime: typeof e.data.bedTime === "string" ? e.data.bedTime : undefined,
        wakeTime: typeof e.data.wakeTime === "string" ? e.data.wakeTime : undefined,
      })),
    };
    return buildTimeline(source, dateObj, selectedDate);
    // dateObj is derived from selectedDate; depending on the string avoids rebuilding every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, selectedDate]);

  const visibleBlocks = useMemo(() => (built ? built.blocks.filter((b) => filters[b.kind]) : []), [built, filters]);
  // Re-packed over only the visible blocks, so hiding a kind never leaves an empty row behind.
  const packed = useMemo(() => assignLanes(visibleBlocks.map((b) => ({ ...b }))), [visibleBlocks]);
  const packedRows = Math.max(1, ...packed.map((b) => b.lane + 1));
  const expanded = packed.find((b) => b.id === selectedId);
  const totals = useMemo(() => totalsByKind(built?.blocks ?? []), [built]);
  const gaps = useMemo(() => findFreeGaps(built?.blocks ?? []), [built]);
  const overlaps = useMemo(() => findOverlaps(built?.blocks ?? []), [built]);

  // Zoomed views centre on "now" for today, and on midday for any other date.
  const vp = viewportFor(zoom, isToday ? now : 12 * 60);
  const spanMin = vp.endMin - vp.startMin;
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

  function goToDate(next: string) {
    setSelectedId(null);
    setSearchParams(next === realToday ? {} : { date: next });
  }

  function toggleFilter(kind: TimelineKind) {
    setFilters((prev) => ({ ...prev, [kind]: !prev[kind] }));
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

  function stepStatus(routineId: string, stepIndex: number) {
    return data?.routineLogs.find((l) => l.routineId === routineId && l.stepIndex === stepIndex);
  }

  const nowPct = ((now - vp.startMin) / spanMin) * 100;
  const showNow = isToday && nowPct >= 0 && nowPct <= 100;

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
            Sleep {formatDuration(totals.sleep)} · Routines {formatDuration(totals.routine)} · Meds {formatDuration(totals.med)} · Tasks {formatDuration(totals.task)}
          </p>

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
                {Array.from({ length: 25 }, (_, h) => h)
                  .filter((h) => h < 24)
                  .map((h) => (
                    <span key={h} className="absolute top-1 -translate-x-1/2" style={{ left: `${pctOfDay(h * 60)}%` }}>
                      {String(h).padStart(2, "0")}
                    </span>
                  ))}
              </div>

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
                      stepStatus={stepStatus}
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
          <UnscheduledList items={built.unscheduled} />
          {built.unscheduled.length > 0 && (
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
      className={`absolute z-10 overflow-hidden rounded-control border px-1.5 py-1 text-left text-xs leading-tight text-paper-card ${color} ${selected ? "border-ink ring-2 ring-bloom dark:border-paper" : "border-transparent"}`}
      style={{ left: `${pctOfDay(block.startMin)}%`, width: `${pctOfDay(block.endMin - block.startMin)}%`, top: block.lane * SUB_ROW_PX + 22, height: SUB_ROW_PX - 6, minWidth: 44 }}
    >
      <span className="block truncate font-medium">{block.title}</span>
      <span className="block tabular-nums opacity-90">
        {hhmm(block.startMin)}–{hhmm(block.endMin)}
      </span>
    </button>
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
}: {
  block: TimelineBlock;
  data: TimelineData;
  selectedDate: string;
  onMed: (medicationId: string, status: MedicationLogStatus, note?: string) => void;
  onTask: (task: Task) => void;
  onRoutineStep: (routine: RoutineTemplate, stepIndex: number, status: RoutineStepLog["status"], note?: string) => void;
  stepStatus: (routineId: string, stepIndex: number) => RoutineStepLog | undefined;
}) {
  const header = (
    <p className="text-sm font-medium text-ink dark:text-paper">
      {block.title} <span className="tabular-nums text-ink-muted dark:text-mist-muted">{hhmm(block.startMin)}–{hhmm(block.endMin)}</span>
    </p>
  );

  if (block.kind === "med") {
    const medId = block.id.replace(/^med:/, "");
    const log = data.medicationLogs.find((l) => l.medicationId === medId);
    return (
      <div className="rounded-control border border-stone bg-paper-card p-3 dark:border-stone-dark dark:bg-ink-bg-card">
        {header}
        <div className="mt-2">
          <MedicationStatusButtons
            status={log?.status ?? null}
            note={log?.note}
            pending={false}
            showAddNote={selectedDate <= todayLocal()}
            onSetStatus={(status, note) => onMed(medId, status, note)}
          />
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
      <div className="rounded-control border border-stone bg-paper-card p-3 dark:border-stone-dark dark:bg-ink-bg-card">
        {header}
        <button
          type="button"
          onClick={() => onTask(task)}
          disabled={isDone}
          className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-control border border-stone text-sm font-medium disabled:opacity-60 dark:border-stone-dark"
          aria-pressed={isDone}
        >
          {isDone && <Icon icon={Check} size={14} />}
          {isDone ? "Done" : "Mark done"}
        </button>
      </div>
    );
  }

  if (block.kind === "routine") {
    const routineId = block.id.replace(/^routine:/, "");
    const routine = data.routines.find((r) => r.routineId === routineId);
    if (!routine) return null;
    return (
      <div className="rounded-control border border-stone bg-paper-card p-3 dark:border-stone-dark dark:bg-ink-bg-card">
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
      </div>
    );
  }

  // Sleep: read-only here; it's logged from the Today screen.
  return <div className="rounded-control border border-stone bg-paper-card p-3 dark:border-stone-dark dark:bg-ink-bg-card">{header}</div>;
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

function UnscheduledList({ items }: { items: UnscheduledItem[] }) {
  if (items.length === 0) return <p className={mutedText}>Everything has a time.</p>;
  return (
    <ul className="divide-y divide-stone rounded-control border border-stone dark:divide-stone-dark dark:border-stone-dark">
      {items.map((item) => (
        <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <span className="break-words text-ink dark:text-paper">{item.title}</span>
          <span className="shrink-0 text-xs text-ink-muted dark:text-mist-muted">{item.reason}</span>
        </li>
      ))}
    </ul>
  );
}
