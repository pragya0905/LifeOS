import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { useApi } from "../api/useApi";
import { useAuth } from "../auth/AuthContext";
import { addDays, isValidDateStr, todayLocal } from "../lib/date";
import { appliesOnDate, byTimeOfDay } from "../lib/weekdays";
import { computeRoutineStreak, routineStreakWindowStart } from "../lib/routineStreak";
import { medicationStatusLabel, routineStatusLabel } from "../lib/statusDisplay";
import { loadEveningHour, motionAllowed } from "../lib/preferences";
import { readCache, writeCache } from "../lib/dataCache";
import {
  defaultModuleConfig,
  loadModuleConfig,
  saveModuleConfig,
  type TodayModuleConfig,
  type TodayModuleId,
} from "../lib/todayModules";
import type {
  HabitLog,
  LogEntry,
  Medication,
  MedicationLog,
  ProgressSummary,
  RoutineStepLog,
  RoutineTemplate,
  Task,
  UserProfile,
} from "../types";
import { Icon } from "../components/Icon";
import { Card } from "../components/Card";
import { useToast } from "../components/Toast";
import { Skeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { Celebration } from "../components/Celebration";
import { TodayHeader } from "../components/TodayHeader";
import { TodayTasksSection, type TaskRowAction } from "../components/TodayTasksSection";
import { TodayRoutinesSection, type RoutineGroup, type RoutineStepRow } from "../components/TodayRoutinesSection";
import { TodayMedicationsSection, type MedicationRow } from "../components/TodayMedicationsSection";
import { TodayLogYourDay } from "../components/TodayLogYourDay";
import { TodayAssistantPrompt } from "../components/TodayAssistantPrompt";
import { TodayCustomizePanel } from "../components/TodayCustomizePanel";
import { TodayJournalPrompt } from "../components/TodayJournalPrompt";
import { TodayInsightsRecap } from "../components/TodayInsightsRecap";
import WelcomeCard from "../components/WelcomeCard";
import Achievements from "../components/Achievements";
import TodayHabits from "../components/TodayHabits";
import TodayMeals from "../components/TodayMeals";
import TodayExpenses from "../components/TodayExpenses";
import TodayCycle from "../components/TodayCycle";
import BudgetPreview from "../components/BudgetPreview";
import { errorText, page, secondaryButton, sectionLabel } from "../components/ui";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

// Full weekday + month + day — used as the page title on any date that isn't today.
function fullDateLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

// Compact weekday + month + day — sits next to the prev/next arrows and in the banner, so it
// stays short even when the title line above it already spells the date out in full.
function compactDateLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

interface TodayData {
  tasks: Task[];
  routines: RoutineTemplate[];
  // Just the viewed date's own routine step logs (from the single-date endpoint) — what every
  // display/edit path uses. Streak math is separate (see routineStreakLogs below): a streak is
  // always anchored to the real current day, never to whichever day is being viewed.
  routineLogsForDate: RoutineStepLog[];
  routineStreakLogs: RoutineStepLog[];
  medications: Medication[];
  medicationLogs: MedicationLog[];
  habits: HabitLog[];
  profile: UserProfile | null;
  progressSummary: ProgressSummary | null;
  journalToday: LogEntry[];
  // Full (unfiltered) cycle history, not just the viewed date's — TodayCycle needs the whole
  // series for its phase estimate, and Dashboard only needs a same-day slice of it. One fetch
  // covers both instead of two independent ones for the same resource.
  cycleAll: LogEntry[];
  moodToday: LogEntry[];
}

// Wave 1: everything the always-visible lists need for first paint. Wave 2: everything else
// (Log-your-day, achievements, insights, cycle/meals/expenses modules) — deferred until
// after wave 1 has rendered so the useful part of the screen shows up first.
type Wave1Data = Pick<TodayData, "tasks" | "routines" | "routineLogsForDate" | "routineStreakLogs" | "medications" | "medicationLogs">;
type Wave2Data = Pick<TodayData, "habits" | "profile" | "progressSummary" | "journalToday" | "cycleAll" | "moodToday">;

const EMPTY_WAVE2: Wave2Data = {
  habits: [],
  profile: null,
  progressSummary: null,
  journalToday: [],
  cycleAll: [],
  moodToday: [],
};

function wave1CacheKey(date: string): string {
  return `today-wave1:${date}`;
}
function wave2CacheKey(date: string): string {
  return `today-wave2:${date}`;
}

function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { name?: unknown }).name === "AbortError";
}

function isRoutineComplete(routine: RoutineTemplate, logs: RoutineStepLog[]): boolean {
  return routine.steps.every((_, i) => {
    const status = logs.find((l) => l.routineId === routine.routineId && l.stepIndex === i)?.status;
    return status === "done" || status === "not_applicable";
  });
}

export default function Dashboard() {
  const { request } = useApi();
  const { user } = useAuth();
  const userId = user?.userId ?? "";
  const { show: showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // The real current date, re-checked at the next local midnight (see the rollover effect
  // below) rather than on a recurring poll — so a tab left open overnight on "today" follows
  // the date forward instead of silently freezing on yesterday.
  const [realToday, setRealToday] = useState(todayLocal());
  useEffect(() => {
    function msUntilNextMidnight(): number {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
      return next.getTime() - now.getTime();
    }
    let timer: number;
    function tick() {
      setRealToday(todayLocal());
      timer = window.setTimeout(tick, msUntilNextMidnight());
    }
    timer = window.setTimeout(tick, msUntilNextMidnight());
    return () => window.clearTimeout(timer);
  }, []);

  const dateParam = searchParams.get("date");
  const selectedDate = dateParam && isValidDateStr(dateParam) ? dateParam : realToday;
  const isToday = selectedDate === realToday;
  const isFuture = selectedDate > realToday;
  const editable = !isFuture;

  function goToDate(date: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (date === realToday) next.delete("date");
        else next.set("date", date);
        return next;
      },
      { replace: false },
    );
  }

  // Invalid `?date=` (bad format, or a real calendar impossibility) silently falls back to
  // today for rendering above, but the address bar itself should stop showing the garbage.
  useEffect(() => {
    if (dateParam && !isValidDateStr(dateParam)) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("date");
        return next;
      }, { replace: true });
    }
  }, [dateParam, setSearchParams]);

  // Midnight rollover while viewing "today": if the URL had no explicit date (or explicitly
  // matched the old today) and real today just advanced, follow it forward instead of the
  // view silently becoming "yesterday" under an unchanged URL.
  const prevRealTodayRef = useRef(realToday);
  useEffect(() => {
    if (prevRealTodayRef.current !== realToday) {
      const wasViewingToday = !dateParam || dateParam === prevRealTodayRef.current;
      prevRealTodayRef.current = realToday;
      if (wasViewingToday && dateParam) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete("date");
          return next;
        }, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realToday]);

  const [data, setData] = useState<TodayData | null>(() => {
    if (!userId) return null;
    const wave1 = readCache<Wave1Data>(userId, wave1CacheKey(selectedDate));
    if (!wave1) return null;
    const wave2 = readCache<Wave2Data>(userId, wave2CacheKey(selectedDate));
    return { ...wave1, ...(wave2 ?? EMPTY_WAVE2) };
  });
  // The cached snapshot this load started from (if any) — compared against the fully-settled
  // background refresh so the "Updated just now" hint only fires when something actually
  // changed, not on every quiet no-op revalidation. Reset whenever the viewed date changes.
  const initialSnapshotRef = useRef<string | null>(data ? JSON.stringify(data) : null);
  // Kept in sync with `data` via the effect below so the fetch effect (which intentionally
  // does not depend on `data`, to avoid re-fetching on every mutation) can still read the
  // current value when a wave resolves.
  const latestDataRef = useRef<TodayData | null>(data);
  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);

  const [error, setError] = useState<string | null>(null);
  const [syncHint, setSyncHint] = useState<"offline" | "updated" | null>(null);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [modules, setModules] = useState<TodayModuleConfig[]>(defaultModuleConfig);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [expandedRoutines, setExpandedRoutines] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setModules(loadModuleConfig());
  }, []);

  // Never show a stale day's data while a new date loads: as soon as the selected date
  // changes, hydrate `data` from that date's own cache (instant SWR paint, same as the
  // mount-time lazy useState initializer below handles for the first load) or drop straight
  // to the skeleton if there's no cache for it — never leave the previous date's content on
  // screen mid-navigation. Skipped on the very first run since the lazy initializer already
  // covers mount.
  const skipNextDateEffectRef = useRef(true);
  useEffect(() => {
    if (!userId) return;
    if (skipNextDateEffectRef.current) {
      skipNextDateEffectRef.current = false;
      return;
    }
    const wave1 = readCache<Wave1Data>(userId, wave1CacheKey(selectedDate));
    if (!wave1) {
      setData(null);
      initialSnapshotRef.current = null;
      return;
    }
    const wave2 = readCache<Wave2Data>(userId, wave2CacheKey(selectedDate));
    const merged = { ...wave1, ...(wave2 ?? EMPTY_WAVE2) };
    setData(merged);
    initialSnapshotRef.current = JSON.stringify(merged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, userId]);

  function wave1Fetch(date: string, signal: AbortSignal, windowStart: string) {
    return Promise.all([
      request<{ tasks: Task[] }>("/tasks", { signal }),
      request<{ routines: RoutineTemplate[] }>("/routines", { signal }),
      request<{ logs: RoutineStepLog[] }>(`/routine-logs/${date}`, { signal }),
      request<{ logs: RoutineStepLog[] }>(`/routine-logs?from=${windowStart}&to=${realToday}`, { signal }),
      request<{ medications: Medication[] }>("/medications", { signal }),
      request<{ logs: MedicationLog[] }>(`/medication-logs/${date}`, { signal }),
    ]).then(([tasksRes, routinesRes, dateLogsRes, streakLogsRes, medsRes, medLogsRes]): Wave1Data => ({
      tasks: tasksRes.tasks,
      routines: routinesRes.routines,
      routineLogsForDate: dateLogsRes.logs,
      routineStreakLogs: streakLogsRes.logs,
      medications: medsRes.medications,
      medicationLogs: medLogsRes.logs,
    }));
  }

  function wave2Fetch(date: string, signal: AbortSignal) {
    return Promise.all([
      request<{ habits: HabitLog[] }>(`/habits/${date}`, { signal }),
      request<UserProfile>("/profile", { signal }),
      request<ProgressSummary>("/progress-summary", { signal }),
      request<{ entries: LogEntry[] }>(`/journal?from=${date}&to=${date}`, { signal }),
      request<{ entries: LogEntry[] }>("/logs?logType=cycle", { signal }),
      request<{ entries: LogEntry[] }>(`/logs?logType=mood&from=${date}&to=${date}`, { signal }),
    ]).then(([habitsRes, profileRes, progressSummaryRes, journalRes, cycleRes, moodRes]): Wave2Data => ({
      habits: habitsRes.habits,
      profile: profileRes,
      progressSummary: progressSummaryRes,
      journalToday: journalRes.entries,
      cycleAll: cycleRes.entries,
      moodToday: moodRes.entries,
    }));
  }

  // Two-wave, cache-backed, cancellable load for the viewed date, plus a quiet prefetch of
  // the adjacent two dates so the prev/next arrows feel instant. See the StrictMode comment
  // on the cleanup below (same class of bug, same fix, as BottomSheet.tsx's history effect)
  // for why the abort is deferred via a ref-guarded fetchKey rather than fired directly.
  const abortTimerRef = useRef<number | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const startedForRef = useRef<string | null>(null);
  const updatedHintTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    const fetchKey = `${userId}:${selectedDate}`;

    if (abortTimerRef.current !== null) {
      window.clearTimeout(abortTimerRef.current);
      abortTimerRef.current = null;
    }

    if (startedForRef.current !== fetchKey) {
      // A genuine user/date change (not a StrictMode phantom remount of the same key) —
      // cancel whatever was still in flight for the old key right away and start fresh.
      controllerRef.current?.abort();
      startedForRef.current = fetchKey;
      const controller = new AbortController();
      controllerRef.current = controller;
      const windowStart = routineStreakWindowStart();

      async function loadWave2(signal: AbortSignal) {
        try {
          const wave2 = await wave2Fetch(selectedDate, signal);
          if (startedForRef.current !== fetchKey) return;
          writeCache(userId, wave2CacheKey(selectedDate), wave2);
          // Merge via the functional updater (not a value computed from latestDataRef) so
          // this always lands on whatever the truly-current state is, even if a mutation's
          // own optimistic/confirmed write happened in the same tick this wave resolved —
          // manual edits must never be clobbered by a background refresh landing concurrently.
          let mergedForHint: TodayData | null = null;
          setData((prev) => {
            if (!prev) return prev;
            const merged = { ...prev, ...wave2 };
            mergedForHint = merged;
            return merged;
          });
          if (updatedHintTimerRef.current !== null) {
            window.clearTimeout(updatedHintTimerRef.current);
            updatedHintTimerRef.current = null;
          }
          if (initialSnapshotRef.current !== null && mergedForHint) {
            const changed = JSON.stringify(mergedForHint) !== initialSnapshotRef.current;
            setSyncHint(changed ? "updated" : null);
            if (changed) {
              updatedHintTimerRef.current = window.setTimeout(() => {
                setSyncHint((h) => (h === "updated" ? null : h));
              }, 3500);
            }
          } else {
            setSyncHint(null);
          }
          initialSnapshotRef.current = mergedForHint ? JSON.stringify(mergedForHint) : null;
        } catch (err) {
          if (isAbortError(err)) return;
          setSyncHint(latestDataRef.current ? "offline" : null);
        }
      }

      async function loadWave1(signal: AbortSignal) {
        try {
          const wave1 = await wave1Fetch(selectedDate, signal, windowStart);
          if (startedForRef.current !== fetchKey) return;
          writeCache(userId, wave1CacheKey(selectedDate), wave1);
          setData((prev) => ({ ...(prev ?? { ...wave1, ...EMPTY_WAVE2 }), ...wave1 }));
          setError(null);
          // Deferred to a microtask so wave 1 has a chance to actually paint before wave 2
          // starts competing for the connection/main thread.
          void Promise.resolve().then(() => loadWave2(signal));
          // Quietly prefetch the neighboring dates (not awaited, not shown loading, failures
          // ignored outright) so stepping with the arrows reads from cache instantly next
          // time — a plain uncancelled fetch, not tied to this date's own abort controller,
          // since switching dates again shouldn't cancel a still-useful background prefetch.
          for (const neighbor of [addDays(selectedDate, -1), addDays(selectedDate, 1)]) {
            if (readCache<Wave1Data>(userId, wave1CacheKey(neighbor))) continue;
            wave1Fetch(neighbor, new AbortController().signal, windowStart)
              .then((w1) => writeCache(userId, wave1CacheKey(neighbor), w1))
              .catch(() => {});
          }
        } catch (err) {
          if (isAbortError(err)) return;
          if (latestDataRef.current) {
            setSyncHint("offline");
          } else {
            setError(err instanceof Error ? err.message : "Failed to load today's data");
          }
        }
      }

      void loadWave1(controller.signal);
    }

    return () => {
      abortTimerRef.current = window.setTimeout(() => {
        abortTimerRef.current = null;
        if (startedForRef.current === fetchKey) {
          startedForRef.current = null;
          controllerRef.current?.abort();
          controllerRef.current = null;
        }
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selectedDate, realToday]);

  useEffect(
    () => () => {
      if (updatedHintTimerRef.current !== null) window.clearTimeout(updatedHintTimerRef.current);
    },
    [],
  );

  function withPending<T>(key: string, fn: () => Promise<T>): Promise<T> {
    setPendingKeys((prev) => new Set(prev).add(key));
    return fn().finally(() => {
      setPendingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    });
  }

  function isPending(key: string): boolean {
    return pendingKeys.has(key);
  }

  // Optimistic mutation helper: applies `optimisticApply` to `data` immediately (before the
  // network call), then either merges the confirmed server response in on success or rolls
  // all the way back to the pre-mutation snapshot on failure. Manual edits (this function)
  // always take priority over whatever the background SWR refresh last wrote — the refresh
  // only ever replaces `data` wholesale from a fresh wave fetch, never races a single in-
  // flight mutation's own optimistic/confirmed writes.
  async function mutate<T>(
    key: string,
    optimisticApply: (prev: TodayData) => TodayData,
    run: () => Promise<T>,
    confirmedApply: (prev: TodayData, result: T) => TodayData,
  ): Promise<T | undefined> {
    if (!data || !editable) return undefined;
    // Captured from this render's closure, not a ref — correct for the common case of one
    // mutation at a time. A failed mutation whose in-flight window overlapped a background
    // SWR refresh landing would roll back that refresh's fields too, not just its own; an
    // accepted edge case rather than a full merge system for a single-user Today screen.
    const snapshot = data;
    setData((prev) => (prev ? optimisticApply(prev) : prev));
    try {
      const result = await withPending(key, run);
      setData((prev) => (prev ? confirmedApply(prev, result) : prev));
      return result;
    } catch (err) {
      setData(snapshot);
      showToast("Something went wrong — that change wasn't saved");
      throw err;
    }
  }

  async function mutateBulk<T>(
    keys: string[],
    optimisticApply: (prev: TodayData) => TodayData,
    run: () => Promise<T[]>,
    confirmedApply: (prev: TodayData, results: T[]) => TodayData,
  ): Promise<T[] | undefined> {
    if (!data || !editable) return undefined;
    // Captured from this render's closure, not a ref — correct for the common case of one
    // mutation at a time. A failed mutation whose in-flight window overlapped a background
    // SWR refresh landing would roll back that refresh's fields too, not just its own; an
    // accepted edge case rather than a full merge system for a single-user Today screen.
    const snapshot = data;
    setData((prev) => (prev ? optimisticApply(prev) : prev));
    setPendingKeys((prev) => {
      const next = new Set(prev);
      for (const k of keys) next.add(k);
      return next;
    });
    try {
      const results = await run();
      setData((prev) => (prev ? confirmedApply(prev, results) : prev));
      return results;
    } catch (err) {
      setData(snapshot);
      showToast("Something went wrong — those changes weren't saved");
      throw err;
    } finally {
      setPendingKeys((prev) => {
        const next = new Set(prev);
        for (const k of keys) next.delete(k);
        return next;
      });
    }
  }

  // --- Mutations — same endpoints Tasks/Routines/Medications/Wishes/Journal/Habits/Cycle
  // pages already use; nothing here changes an API contract. Every mutation applies to
  // `selectedDate`, not necessarily the real today — editing a past day backfills that day. ---

  async function completeTask(taskId: string) {
    if (!data || !editable) return;
    const prevStatus = data.tasks.find((t) => t.taskId === taskId)?.status ?? "todo";
    let updated: Task | undefined;
    try {
      updated = await mutate(
        `task:${taskId}`,
        (prev) => ({ ...prev, tasks: prev.tasks.map((t) => (t.taskId === taskId ? { ...t, status: "done" } : t)) }),
        () => request<Task>(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) }),
        (prev, result) => ({ ...prev, tasks: prev.tasks.map((t) => (t.taskId === taskId ? result : t)) }),
      );
    } catch {
      return;
    }
    if (!updated) return;
    showToast(`"${updated.title}" done`, {
      undo: () => {
        request<Task>(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status: prevStatus }) })
          .then((reverted) => setData((prev) => prev && { ...prev, tasks: prev.tasks.map((t) => (t.taskId === taskId ? reverted : t)) }))
          .catch(() => {});
      },
    });
  }

  function findRoutineLog(routineId: string, stepIndex: number): RoutineStepLog | undefined {
    return data?.routineLogsForDate.find((l) => l.routineId === routineId && l.stepIndex === stepIndex);
  }

  function optimisticRoutineLog(routineId: string, stepIndex: number, status: RoutineStepLog["status"], note: string | undefined, prev?: RoutineStepLog): RoutineStepLog {
    return {
      userId: prev?.userId ?? userId,
      dateRoutineStep: `${selectedDate}#${routineId}#${stepIndex}`,
      date: selectedDate,
      routineId,
      stepIndex,
      status,
      note: note || undefined,
      source: "manual",
      createdAt: prev?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function replaceRoutineLogs(logs: RoutineStepLog[], updates: RoutineStepLog[]): RoutineStepLog[] {
    // Matched by (routineId, stepIndex) — every entry in this list is already scoped to
    // `selectedDate` (the single-date endpoint), so the date itself needn't be part of the
    // match. An optimistic entry's guessed dateRoutineStep key only needs to be internally
    // consistent with itself, not byte-identical to the server's.
    return [
      ...logs.filter((l) => !updates.some((u) => u.routineId === l.routineId && u.stepIndex === l.stepIndex)),
      ...updates,
    ];
  }

  function maybeCelebrateRoutine(routine: RoutineTemplate, updatedSteps: RoutineStepLog[]) {
    if (!data) return;
    const wasComplete = isRoutineComplete(routine, data.routineLogsForDate);
    const mergedLogs = replaceRoutineLogs(data.routineLogsForDate, updatedSteps);
    const isComplete = isRoutineComplete(routine, mergedLogs);
    if (!wasComplete && isComplete) setCelebration(`${routine.name} — all done!`);
  }

  // Shared by the always-visible per-step Done/Skipped/N-A buttons and the inline note save.
  async function setRoutineStepStatus(routine: RoutineTemplate, stepIndex: number, status: RoutineStepLog["status"], note?: string) {
    const prevLog = findRoutineLog(routine.routineId, stepIndex);
    let updated: RoutineStepLog | undefined;
    try {
      updated = await mutate(
        `routine:${routine.routineId}:${stepIndex}`,
        (prev) => ({ ...prev, routineLogsForDate: replaceRoutineLogs(prev.routineLogsForDate, [optimisticRoutineLog(routine.routineId, stepIndex, status, note, prevLog)]) }),
        () => request<RoutineStepLog>(`/routine-logs/${selectedDate}/${routine.routineId}/${stepIndex}`, { method: "PATCH", body: JSON.stringify({ status, note: note ?? "" }) }),
        (prev, result) => ({ ...prev, routineLogsForDate: replaceRoutineLogs(prev.routineLogsForDate, [result]) }),
      );
    } catch {
      return;
    }
    if (!updated) return;
    if (status === "done") maybeCelebrateRoutine(routine, [updated]);
    showToast(routineStatusLabel(status, note), {
      undo: () => {
        request<RoutineStepLog>(`/routine-logs/${selectedDate}/${routine.routineId}/${stepIndex}`, {
          method: "PATCH",
          body: JSON.stringify({ status: prevLog?.status ?? "skipped", note: prevLog?.note ?? "" }),
        })
          .then((reverted) => setData((prev) => prev && { ...prev, routineLogsForDate: replaceRoutineLogs(prev.routineLogsForDate, [reverted]) }))
          .catch(() => {});
      },
    });
  }

  // Only steps with NO log yet on the viewed date are affected — a step already explicitly
  // Skipped or N/A is left alone, same rule for both "Mark all done" and "Skip all remaining".
  function pendingStepIndexes(routine: RoutineTemplate): number[] {
    return routine.steps.map((_, i) => i).filter((i) => findRoutineLog(routine.routineId, i) === undefined);
  }

  async function markAllDoneSteps(routine: RoutineTemplate) {
    const pendingSteps = pendingStepIndexes(routine);
    if (pendingSteps.length === 0) return;
    let updated: RoutineStepLog[] | undefined;
    try {
      updated = await mutateBulk(
        pendingSteps.map((i) => `routine:${routine.routineId}:${i}`),
        (prev) => ({ ...prev, routineLogsForDate: replaceRoutineLogs(prev.routineLogsForDate, pendingSteps.map((i) => optimisticRoutineLog(routine.routineId, i, "done", undefined))) }),
        () => Promise.all(pendingSteps.map((i) => request<RoutineStepLog>(`/routine-logs/${selectedDate}/${routine.routineId}/${i}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) }))),
        (prev, results) => ({ ...prev, routineLogsForDate: replaceRoutineLogs(prev.routineLogsForDate, results) }),
      );
    } catch {
      return;
    }
    if (!updated) return;
    maybeCelebrateRoutine(routine, updated);
    showToast(`${routine.name}: ${pendingSteps.length} step${pendingSteps.length === 1 ? "" : "s"} marked done`, {
      undo: () => {
        Promise.all(pendingSteps.map((i) => request<RoutineStepLog>(`/routine-logs/${selectedDate}/${routine.routineId}/${i}`, { method: "PATCH", body: JSON.stringify({ status: "skipped" }) })))
          .then((reverted) => setData((prev) => prev && { ...prev, routineLogsForDate: replaceRoutineLogs(prev.routineLogsForDate, reverted) }))
          .catch(() => {});
      },
    });
  }

  async function skipRemainingSteps(routine: RoutineTemplate) {
    const pendingSteps = pendingStepIndexes(routine);
    if (pendingSteps.length === 0) return;
    try {
      await mutateBulk(
        pendingSteps.map((i) => `routine:${routine.routineId}:${i}`),
        (prev) => ({ ...prev, routineLogsForDate: replaceRoutineLogs(prev.routineLogsForDate, pendingSteps.map((i) => optimisticRoutineLog(routine.routineId, i, "skipped", undefined))) }),
        () => Promise.all(pendingSteps.map((i) => request<RoutineStepLog>(`/routine-logs/${selectedDate}/${routine.routineId}/${i}`, { method: "PATCH", body: JSON.stringify({ status: "skipped" }) }))),
        (prev, results) => ({ ...prev, routineLogsForDate: replaceRoutineLogs(prev.routineLogsForDate, results) }),
      );
    } catch {
      return;
    }
    showToast(`${routine.name}: ${pendingSteps.length} remaining step${pendingSteps.length === 1 ? "" : "s"} skipped`, {
      undo: () => {
        Promise.all(pendingSteps.map((i) => request<RoutineStepLog>(`/routine-logs/${selectedDate}/${routine.routineId}/${i}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) })))
          .then((reverted) => setData((prev) => prev && { ...prev, routineLogsForDate: replaceRoutineLogs(prev.routineLogsForDate, reverted) }))
          .catch(() => {});
      },
    });
  }

  function optimisticMedicationLog(medicationId: string, status: MedicationLog["status"], note: string | undefined, prev?: MedicationLog): MedicationLog {
    return {
      userId: prev?.userId ?? userId,
      dateMedicationId: `${selectedDate}#${medicationId}`,
      date: selectedDate,
      medicationId,
      status,
      note: note || undefined,
      source: "manual",
      createdAt: prev?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function replaceMedicationLogs(logs: MedicationLog[], updates: MedicationLog[]): MedicationLog[] {
    return [...logs.filter((l) => !updates.some((u) => u.medicationId === l.medicationId)), ...updates];
  }

  function maybeCelebrateMeds(updatedLogs: MedicationLog[]) {
    if (!data) return;
    const applicable = data.medications.filter((m) => appliesOnDate(m.daysOfWeek, new Date(`${selectedDate}T00:00:00`)));
    const wasAllTaken = applicable.every((m) => data.medicationLogs.find((l) => l.medicationId === m.medicationId)?.status === "taken");
    const mergedLogs = replaceMedicationLogs(data.medicationLogs, updatedLogs);
    const isAllTaken = applicable.length > 0 && applicable.every((m) => mergedLogs.find((l) => l.medicationId === m.medicationId)?.status === "taken");
    if (!wasAllTaken && isAllTaken) setCelebration("All of today's medications taken!");
  }

  // Shared by every medication status change (always-visible Taken/Skipped/Missed buttons,
  // and Mark all taken).
  async function setMedicationStatus(medicationId: string, status: MedicationLog["status"], note?: string) {
    if (!data || !editable) return;
    const prevLog = data.medicationLogs.find((l) => l.medicationId === medicationId);
    const medName = data.medications.find((m) => m.medicationId === medicationId)?.name ?? "Medication";
    let updated: MedicationLog | undefined;
    try {
      updated = await mutate(
        `med:${medicationId}`,
        (prev) => ({ ...prev, medicationLogs: replaceMedicationLogs(prev.medicationLogs, [optimisticMedicationLog(medicationId, status, note, prevLog)]) }),
        () => request<MedicationLog>(`/medication-logs/${selectedDate}/${medicationId}`, { method: "PATCH", body: JSON.stringify({ status, note: note ?? "" }) }),
        (prev, result) => ({ ...prev, medicationLogs: replaceMedicationLogs(prev.medicationLogs, [result]) }),
      );
    } catch {
      return;
    }
    if (!updated) return;
    if (status === "taken") maybeCelebrateMeds([updated]);
    showToast(`${medName}: ${medicationStatusLabel(status, note)}`, {
      undo: () => {
        request<MedicationLog>(`/medication-logs/${selectedDate}/${medicationId}`, { method: "PATCH", body: JSON.stringify({ status: prevLog?.status ?? "missed", note: prevLog?.note ?? "" }) })
          .then((reverted) => setData((prev) => prev && { ...prev, medicationLogs: replaceMedicationLogs(prev.medicationLogs, [reverted]) }))
          .catch(() => {});
      },
    });
  }

  async function markAllMedicationsTaken(medicationIds: string[]) {
    if (medicationIds.length === 0) return;
    let updated: MedicationLog[] | undefined;
    try {
      updated = await mutateBulk(
        medicationIds.map((id) => `med:${id}`),
        (prev) => ({ ...prev, medicationLogs: replaceMedicationLogs(prev.medicationLogs, medicationIds.map((id) => optimisticMedicationLog(id, "taken", undefined))) }),
        () => Promise.all(medicationIds.map((id) => request<MedicationLog>(`/medication-logs/${selectedDate}/${id}`, { method: "PATCH", body: JSON.stringify({ status: "taken" }) }))),
        (prev, results) => ({ ...prev, medicationLogs: replaceMedicationLogs(prev.medicationLogs, results) }),
      );
    } catch {
      return;
    }
    if (!updated) return;
    maybeCelebrateMeds(updated);
    showToast(`${medicationIds.length} medication${medicationIds.length === 1 ? "" : "s"} marked taken`, {
      undo: () => {
        Promise.all(medicationIds.map((id) => request<MedicationLog>(`/medication-logs/${selectedDate}/${id}`, { method: "PATCH", body: JSON.stringify({ status: "missed" }) })))
          .then((reverted) => setData((prev) => prev && { ...prev, medicationLogs: replaceMedicationLogs(prev.medicationLogs, reverted) }))
          .catch(() => {});
      },
    });
  }

  async function logWater(amountMl: number) {
    if (!data || !editable) return;
    const currentWater = data.habits.find((h) => h.habitType === "water")?.value ?? 0;
    const next = currentWater + amountMl;
    try {
      await mutate(
        "water",
        (prev) => ({
          ...prev,
          habits: [...prev.habits.filter((h) => h.habitType !== "water"), { ...prev.habits.find((h) => h.habitType === "water"), habitType: "water", value: next } as HabitLog],
        }),
        () => request(`/habits/${selectedDate}/water`, { method: "PATCH", body: JSON.stringify({ value: next }) }),
        (prev) => prev,
      );
    } catch {
      return;
    }
    showToast(`+${amountMl}ml water logged`);
  }

  async function logMood(rating: number, note?: string) {
    if (!data || !editable) return;
    const current = data.moodToday[0];
    const optimisticEntry: LogEntry = current
      ? { ...current, data: { rating, note } }
      : {
          logId: "optimistic",
          userId,
          logType: "mood",
          date: selectedDate,
          data: { rating, note },
          source: "manual",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
    try {
      const updated = await mutate(
        "mood",
        (prev) => ({ ...prev, moodToday: [optimisticEntry] }),
        () =>
          current
            ? request<LogEntry>(`/logs/${current.logId}`, { method: "PATCH", body: JSON.stringify({ data: { rating, note } }) })
            : request<LogEntry>("/logs", { method: "POST", body: JSON.stringify({ logType: "mood", date: selectedDate, data: { rating, note } }) }),
        (prev, result) => ({ ...prev, moodToday: [result] }),
      );
      if (!updated) return;
    } catch {
      return;
    }
    showToast(`Mood logged: ${rating}/5`);
  }

  async function logCycleEvent(eventType: "period_start" | "period_end" | "symptom", note?: string): Promise<LogEntry | undefined> {
    if (!data || !editable) return undefined;
    try {
      return await mutate(
        `cycle:${eventType}`,
        (prev) => ({
          ...prev,
          cycleAll: [
            ...prev.cycleAll,
            {
              logId: "optimistic",
              userId,
              logType: "cycle",
              date: selectedDate,
              data: { event: eventType, note },
              source: "manual",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            } satisfies LogEntry,
          ],
        }),
        () => request<LogEntry>("/logs", { method: "POST", body: JSON.stringify({ logType: "cycle", date: selectedDate, data: { event: eventType, note: note || undefined } }) }),
        (prev, result) => ({ ...prev, cycleAll: [...prev.cycleAll.filter((e) => e.logId !== "optimistic"), result] }),
      );
    } catch {
      return undefined;
    }
  }

  async function logPeriodStarted() {
    const entry = await logCycleEvent("period_start");
    if (entry) showToast("Period started logged");
  }

  // --- Derived view model — all keyed off `selectedDate`, not necessarily the real today. ---

  // Stable per `selectedDate` (not per render) so it can sit in useMemo dependency arrays
  // below without defeating the memoization the way a fresh `new Date()` every render would.
  const selectedDateObj = useMemo(() => new Date(`${selectedDate}T00:00:00`), [selectedDate]);

  const todaysTasks = useMemo(() => {
    if (!data) return [];
    if (isToday) {
      return data.tasks.filter((t) => t.dueDate === selectedDate || (t.dueDate && t.dueDate < selectedDate && t.status !== "done"));
    }
    // Past/future days: only tasks due exactly on that date — no overdue rollup, which is a
    // today-only concept — but completed ones still show (as done), same as today's do.
    return data.tasks.filter((t) => t.dueDate === selectedDate);
  }, [data, selectedDate, isToday]);
  const tasksDueToday = useMemo(() => (data ? data.tasks.filter((t) => t.dueDate === selectedDate) : []), [data, selectedDate]);
  const tasksDoneToday = tasksDueToday.filter((t) => t.status === "done").length;

  // Sorted once here (same comparator Routines.tsx/Medications.tsx use) so every downstream
  // use — the list itself, "next routine" selection, etc. — stays in one consistent order.
  // `appliesOnDate` is checked against the VIEWED date, so a weekly/custom-days routine shows
  // up on exactly the days its own recurrence says it should, on any date being viewed.
  const applicableRoutines = useMemo(
    () => (data ? data.routines.filter((r) => appliesOnDate(r.daysOfWeek, selectedDateObj)).sort(byTimeOfDay) : []),
    [data, selectedDateObj],
  );
  const routinesTotal = applicableRoutines.reduce((sum, r) => sum + r.steps.length, 0);
  const viewedLogsByStep = useMemo(() => {
    const map = new Map<string, RoutineStepLog["status"]>();
    for (const log of data?.routineLogsForDate ?? []) map.set(`${log.routineId}#${log.stepIndex}`, log.status);
    return map;
  }, [data]);
  const routinesDone = applicableRoutines.reduce((sum, r) => {
    const doneSteps = r.steps.filter((_, i) => {
      const status = viewedLogsByStep.get(`${r.routineId}#${i}`);
      return status === "done" || status === "not_applicable";
    }).length;
    return sum + doneSteps;
  }, 0);
  // Streak is always anchored to the real current day (computeRoutineStreak itself walks
  // backward from the real todayLocal()), independent of whichever date is being viewed.
  const streakLogsByDateStep = useMemo(() => {
    const map = new Map<string, RoutineStepLog["status"]>();
    for (const log of data?.routineStreakLogs ?? []) map.set(`${log.date}#${log.routineId}#${log.stepIndex}`, log.status);
    return map;
  }, [data]);
  // Track both the max current streak AND that specific routine's paused state — pausedToday
  // only makes sense attached to whichever routine is actually holding the displayed number.
  const routineStreak = applicableRoutines.reduce(
    (best, r) => {
      const result = computeRoutineStreak(r, streakLogsByDateStep);
      return result.current > best.current ? result : best;
    },
    { current: 0, pausedToday: false },
  );
  const routineStreakDays = routineStreak.current;

  const applicableMeds = useMemo(() => (data ? data.medications.filter((m) => appliesOnDate(m.daysOfWeek, selectedDateObj)) : []), [data, selectedDateObj]);
  const medLogByMedId = useMemo(() => {
    const map = new Map<string, MedicationLog>();
    for (const log of data?.medicationLogs ?? []) map.set(log.medicationId, log);
    return map;
  }, [data]);
  const medsDone = applicableMeds.filter((m) => medLogByMedId.get(m.medicationId)?.status === "taken").length;

  const moodLoggedToday = (data?.moodToday[0]?.data.rating as number | undefined) ?? null;

  const hideCycle = data?.profile?.sex === "male";
  const cycleLoggedToday = (data?.cycleAll ?? []).some((e) => e.date === selectedDate && e.data.event === "period_start");
  const journaledToday = (data?.journalToday ?? []).length > 0;

  const waterLogged = (data?.habits ?? []).some((h) => h.habitType === "water");
  const moodLogged = moodLoggedToday !== null;
  const dayFullyLogged = waterLogged && moodLogged && (hideCycle || cycleLoggedToday);
  const isEvening = new Date().getHours() >= loadEveningHour();
  // Future days are planning-only — nothing to log yet. Today keeps the evening-nudge gate;
  // a past day shows the card any time there's still something unlogged, for backfilling.
  const showLogYourDay = isFuture ? false : isToday ? isEvening && !dayFullyLogged : !dayFullyLogged;

  const taskRows: TaskRowAction[] = useMemo(
    () =>
      todaysTasks.map((task) => ({
        task,
        overdue: isToday && Boolean(task.dueDate && task.dueDate < selectedDate && task.status !== "done"),
        pending: isPending(`task:${task.taskId}`),
        editable,
        onComplete: () => void completeTask(task.taskId),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todaysTasks, selectedDate, isToday, editable, pendingKeys],
  );

  // Routines with at least one step that has no log at all on the viewed date (resolved —
  // done/skipped/not_applicable alike — doesn't count as "pending" here, only a genuinely
  // untouched step does). These stay expanded by default; "nextRoutineId" below is a separate
  // concept (which one is due right now, today only) used only for Jump-to-now.
  const unresolvedRoutines = useMemo(
    () =>
      applicableRoutines.filter((r) => r.steps.some((_, i) => viewedLogsByStep.get(`${r.routineId}#${i}`) === undefined)),
    [applicableRoutines, viewedLogsByStep],
  );

  // The unresolved routine whose timeOfDay is nearest the actual current wall-clock time —
  // only meaningful when viewing today; Jump-to-now doesn't apply to a past/future day.
  const nextRoutineId = useMemo(() => {
    if (!isToday || unresolvedRoutines.length === 0) return null;
    const wallNow = new Date();
    const nowStr = `${String(wallNow.getHours()).padStart(2, "0")}:${String(wallNow.getMinutes()).padStart(2, "0")}`;
    const upcoming = unresolvedRoutines
      .filter((r) => r.timeOfDay !== undefined && r.timeOfDay >= nowStr)
      .sort((a, b) => (a.timeOfDay ?? "").localeCompare(b.timeOfDay ?? ""));
    return (upcoming[0] ?? unresolvedRoutines[0]).routineId;
  }, [isToday, unresolvedRoutines]);

  // Lifted out of each row so the top-level Expand-all/Collapse-completed toggle and the
  // Jump-to-now control can act on every routine at once, not just whichever row a user
  // happens to be looking at. Every routine with a pending step defaults to expanded (per
  // spec); nextRoutineId only decides where Jump-to-now scrolls, not which rows start open.
  // Keyed by date too, since the same routineId's expand state shouldn't carry over between
  // two different days' views.
  useEffect(() => {
    setExpandedRoutines({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);
  useEffect(() => {
    setExpandedRoutines((prev) => {
      let changed = false;
      const next = { ...prev };
      const unresolvedIds = new Set(unresolvedRoutines.map((r) => r.routineId));
      for (const r of applicableRoutines) {
        if (!(r.routineId in next)) {
          next[r.routineId] = unresolvedIds.has(r.routineId);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [applicableRoutines, unresolvedRoutines]);

  function toggleRoutineExpanded(routineId: string) {
    setExpandedRoutines((prev) => ({ ...prev, [routineId]: !prev[routineId] }));
  }

  function expandAllRoutines() {
    setExpandedRoutines((prev) => {
      const next = { ...prev };
      for (const r of applicableRoutines) next[r.routineId] = true;
      return next;
    });
  }

  function collapseCompletedRoutines() {
    setExpandedRoutines((prev) => {
      const next = { ...prev };
      for (const r of applicableRoutines) {
        const steps = r.steps.map((_, i) => viewedLogsByStep.get(`${r.routineId}#${i}`));
        if (steps.every((s) => s !== undefined)) next[r.routineId] = false;
      }
      return next;
    });
  }

  function jumpToNextRoutine() {
    if (!nextRoutineId) return;
    setExpandedRoutines((prev) => ({ ...prev, [nextRoutineId]: true }));
    requestAnimationFrame(() => {
      document.getElementById(`routine-${nextRoutineId}`)?.scrollIntoView({ behavior: motionAllowed() ? "smooth" : "auto", block: "start" });
    });
  }

  const routineGroups: RoutineGroup[] = useMemo(
    () =>
      applicableRoutines.map((routine) => {
        const steps: RoutineStepRow[] = routine.steps.map((label, i) => {
          const log = data?.routineLogsForDate.find((l) => l.routineId === routine.routineId && l.stepIndex === i);
          return {
            index: i,
            label,
            status: log?.status ?? null,
            note: log?.note,
            pending: isPending(`routine:${routine.routineId}:${i}`),
          };
        });
        return {
          routine,
          steps,
          expanded: expandedRoutines[routine.routineId] ?? false,
          editable,
          onToggleExpand: () => toggleRoutineExpanded(routine.routineId),
          onSetStatus: (stepIndex, status, note) => setRoutineStepStatus(routine, stepIndex, status, note),
          onMarkAllDone: () => void markAllDoneSteps(routine),
          onSkipRemaining: () => void skipRemainingSteps(routine),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applicableRoutines, data, expandedRoutines, editable, pendingKeys],
  );

  const medicationRows: MedicationRow[] = useMemo(
    () =>
      applicableMeds.map((medication) => ({
        medication,
        status: medLogByMedId.get(medication.medicationId)?.status ?? null,
        note: medLogByMedId.get(medication.medicationId)?.note,
        pending: isPending(`med:${medication.medicationId}`),
        editable,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applicableMeds, medLogByMedId, editable, pendingKeys],
  );

  // --- Module customization ---

  function toggleModuleVisible(id: TodayModuleId) {
    setModules((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, visible: !m.visible } : m));
      saveModuleConfig(next);
      return next;
    });
  }

  function moveModule(id: TodayModuleId, direction: "up" | "down") {
    setModules((prev) => {
      const index = prev.findIndex((m) => m.id === id);
      const swapWith = direction === "up" ? index - 1 : index + 1;
      if (swapWith < 0 || swapWith >= prev.length) return prev;
      const next = prev.slice();
      [next[index], next[swapWith]] = [next[swapWith], next[index]];
      saveModuleConfig(next);
      return next;
    });
  }

  function resetModules() {
    const next = defaultModuleConfig();
    setModules(next);
    saveModuleConfig(next);
  }

  function renderModule(id: TodayModuleId) {
    switch (id) {
      case "header":
        return (
          <TodayHeader
            streakDays={routineStreakDays}
            streakPaused={routineStreak.pausedToday}
            done={tasksDoneToday + routinesDone + medsDone}
            total={tasksDueToday.length + routinesTotal + applicableMeds.length}
            isToday={isToday}
          />
        );
      case "tasks":
        return taskRows.length > 0 ? (
          <Card>
            <h2 className={`mb-3 ${sectionLabel}`}>Tasks</h2>
            <TodayTasksSection rows={taskRows} />
          </Card>
        ) : null;
      case "routines":
        return routineGroups.length > 0 ? (
          <Card>
            <h2 className={`mb-3 ${sectionLabel}`}>Routines</h2>
            <TodayRoutinesSection
              groups={routineGroups}
              onExpandAll={expandAllRoutines}
              onCollapseCompleted={collapseCompletedRoutines}
              onJumpToNext={jumpToNextRoutine}
              hasNextRoutine={nextRoutineId !== null}
            />
          </Card>
        ) : null;
      case "medications":
        return medicationRows.length > 0 ? (
          <Card>
            <h2 className={`mb-3 ${sectionLabel}`}>Medications</h2>
            <TodayMedicationsSection rows={medicationRows} onSetStatus={setMedicationStatus} onMarkAllTaken={(ids) => void markAllMedicationsTaken(ids)} />
          </Card>
        ) : null;
      case "logYourDay":
        return showLogYourDay ? (
          <Card>
            <h2 className={`mb-3 ${sectionLabel}`}>Log your day</h2>
            <TodayLogYourDay
              onLogWater={(amount) => void logWater(amount)}
              waterPending={isPending("water")}
              onLogMood={(rating, note) => void logMood(rating, note)}
              moodPending={isPending("mood")}
              moodLoggedToday={moodLoggedToday}
              showCycleChip={!hideCycle}
              cycleLoggedToday={cycleLoggedToday}
              onLogPeriodStarted={() => void logPeriodStarted()}
              cyclePending={isPending("cycle:period_start")}
              isToday={isToday}
            />
          </Card>
        ) : null;
      case "habits":
        return <TodayHabits date={selectedDate} />;
      case "cycle":
        return hideCycle ? null : (
          <TodayCycle date={selectedDate} entries={data?.cycleAll ?? null} onLogEvent={logCycleEvent} />
        );
      case "budget":
        return <BudgetPreview />;
      case "meals":
        return <TodayMeals date={selectedDate} />;
      case "expenses":
        return <TodayExpenses date={selectedDate} />;
      case "insightsRecap":
        return <TodayInsightsRecap summary={data?.progressSummary ?? null} />;
      case "journalPrompt":
        return <TodayJournalPrompt journaledToday={journaledToday} />;
      case "achievements":
        return <Achievements />;
      default:
        return null;
    }
  }

  // --- Date-nav header UI ---

  const touchStartXRef = useRef<number | null>(null);
  function onHeaderTouchStart(e: React.TouchEvent) {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  }
  function onHeaderTouchEnd(e: React.TouchEvent) {
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    if (startX === null) return;
    const endX = e.changedTouches[0]?.clientX ?? startX;
    const delta = endX - startX;
    if (Math.abs(delta) < 48) return;
    goToDate(addDays(selectedDate, delta > 0 ? -1 : 1));
  }

  if (error) {
    return (
      <div className={page}>
        <p className={errorText}>{error}</p>
      </div>
    );
  }

  if (!data) {
    // Shaped to roughly match the real layout below (header strip, a couple of section
    // cards) so real content doesn't cause a large layout shift once it arrives.
    return (
      <div className={page}>
        <Skeleton className="mb-2 h-8 w-48" />
        <Skeleton className="mb-6 h-4 w-32" />
        <Skeleton className="mb-4 h-16 w-full" />
        <Skeleton className="mb-4 h-40 w-full" />
        <Skeleton className="mb-4 h-56 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const isEmptyDay =
    taskRows.length === 0 && applicableRoutines.length === 0 && applicableMeds.length === 0 && !showLogYourDay;

  return (
    <div className={page}>
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 flex-1 truncate font-display text-2xl font-medium text-ink dark:text-paper sm:text-3xl">
            {isToday ? greeting() : fullDateLabel(selectedDate)}
          </h1>
          <button
            type="button"
            onClick={() => setCustomizeOpen(true)}
            aria-label="Customize Today"
            className={`${secondaryButton} flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs`}
          >
            <Icon icon={SlidersHorizontal} size={13} />
            Customize
          </button>
        </div>

        <div className="flex items-center gap-2" onTouchStart={onHeaderTouchStart} onTouchEnd={onHeaderTouchEnd}>
          <button
            type="button"
            onClick={() => goToDate(addDays(selectedDate, -1))}
            aria-label="Previous day"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone text-ink-muted hover:bg-stone/40 dark:border-stone-dark dark:text-mist-muted dark:hover:bg-stone-dark/40"
          >
            <Icon icon={ChevronLeft} size={16} />
          </button>
          <div className="relative min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-medium text-ink dark:text-paper">{compactDateLabel(selectedDate)}</p>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && isValidDateStr(e.target.value) && goToDate(e.target.value)}
              aria-label="Pick a date"
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </div>
          <button
            type="button"
            onClick={() => goToDate(addDays(selectedDate, 1))}
            aria-label="Next day"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone text-ink-muted hover:bg-stone/40 dark:border-stone-dark dark:text-mist-muted dark:hover:bg-stone-dark/40"
          >
            <Icon icon={ChevronRight} size={16} />
          </button>
          {!isToday && (
            <button
              type="button"
              onClick={() => goToDate(realToday)}
              className="shrink-0 rounded-control border border-bloom px-2.5 py-1.5 text-xs font-medium text-bloom hover:bg-bloom-soft dark:hover:bg-bloom-soft-dark"
            >
              Today
            </button>
          )}
        </div>

        {syncHint && (
          <p className={`-mt-1 text-xs ${syncHint === "offline" ? "text-alert" : "text-ink-muted dark:text-mist-muted"}`}>
            {syncHint === "offline" ? "Offline — showing saved data" : "Updated just now"}
          </p>
        )}

        {!isToday && (
          <div className="flex items-center justify-between gap-3 rounded-control border border-stone bg-stone/20 px-3 py-2 dark:border-stone-dark dark:bg-stone-dark/20">
            <p className="text-sm text-ink dark:text-paper">
              Viewing {compactDateLabel(selectedDate)}
              {isFuture ? " — planning view, can't mark future items" : ""}
            </p>
          </div>
        )}
      </div>

      <WelcomeCard />

      {isEmptyDay ? (
        <EmptyState
          icon="🌤️"
          title={isFuture ? "Nothing scheduled yet" : "Nothing on the books"}
          hint="Add a task from the + button, or start a routine from the Routines tab."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {modules.filter((m) => m.visible).map((m) => {
            const rendered = renderModule(m.id);
            return rendered ? <div key={m.id}>{rendered}</div> : null;
          })}
        </div>
      )}

      <div className="mt-4">
        <TodayAssistantPrompt />
      </div>

      <TodayCustomizePanel
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        modules={modules}
        onToggleVisible={toggleModuleVisible}
        onMove={moveModule}
        onReset={resetModules}
      />

      {celebration && <Celebration onDone={() => setCelebration(null)} />}
    </div>
  );
}
