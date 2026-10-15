import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useApi } from "../api/useApi";
import { todayLocal } from "../lib/date";
import { appliesOnDate } from "../lib/weekdays";
import { computeRoutineStreak, routineStreakWindowStart } from "../lib/routineStreak";
import { medicationStatusLabel, routineStatusLabel } from "../lib/statusDisplay";
import { loadEveningHour } from "../lib/preferences";
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
import { errorText, mutedText, page, pageTitle, secondaryButton, sectionLabel } from "../components/ui";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

function formattedDate(): string {
  return new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

interface TodayData {
  tasks: Task[];
  routines: RoutineTemplate[];
  routineRangeLogs: RoutineStepLog[];
  medications: Medication[];
  medicationLogs: MedicationLog[];
  habits: HabitLog[];
  profile: UserProfile | null;
  progressSummary: ProgressSummary | null;
  journalToday: LogEntry[];
  cycleToday: LogEntry[];
  moodToday: LogEntry[];
}

function isRoutineComplete(routine: RoutineTemplate, logs: RoutineStepLog[], date: string): boolean {
  return routine.steps.every((_, i) => {
    const status = logs.find((l) => l.date === date && l.routineId === routine.routineId && l.stepIndex === i)?.status;
    return status === "done" || status === "not_applicable";
  });
}

export default function Dashboard() {
  const { request } = useApi();
  const { show: showToast } = useToast();
  const today = todayLocal();

  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [modules, setModules] = useState<TodayModuleConfig[]>(defaultModuleConfig);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [celebration, setCelebration] = useState<string | null>(null);

  useEffect(() => {
    setModules(loadModuleConfig());
  }, []);

  useEffect(() => {
    let ignore = false;
    const windowStart = routineStreakWindowStart();

    Promise.all([
      request<{ tasks: Task[] }>("/tasks"),
      request<{ routines: RoutineTemplate[] }>("/routines"),
      request<{ logs: RoutineStepLog[] }>(`/routine-logs?from=${windowStart}&to=${today}`),
      request<{ medications: Medication[] }>("/medications"),
      request<{ logs: MedicationLog[] }>(`/medication-logs/${today}`),
      request<{ habits: HabitLog[] }>(`/habits/${today}`),
      request<UserProfile>("/profile"),
      request<ProgressSummary>("/progress-summary"),
      request<{ entries: LogEntry[] }>(`/journal?from=${today}&to=${today}`),
      request<{ entries: LogEntry[] }>(`/logs?logType=cycle&from=${today}&to=${today}`),
      request<{ entries: LogEntry[] }>(`/logs?logType=mood&from=${today}&to=${today}`),
    ])
      .then(
        ([
          tasksRes,
          routinesRes,
          routineLogsRes,
          medicationsRes,
          medicationLogsRes,
          habitsRes,
          profileRes,
          progressSummaryRes,
          journalRes,
          cycleRes,
          moodRes,
        ]) => {
          if (ignore) return;
          setData({
            tasks: tasksRes.tasks,
            routines: routinesRes.routines,
            routineRangeLogs: routineLogsRes.logs,
            medications: medicationsRes.medications,
            medicationLogs: medicationLogsRes.logs,
            habits: habitsRes.habits,
            profile: profileRes,
            progressSummary: progressSummaryRes,
            journalToday: journalRes.entries,
            cycleToday: cycleRes.entries,
            moodToday: moodRes.entries,
          });
        },
      )
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : "Failed to load today's data");
      });

    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // --- Mutations — same endpoints Tasks/Routines/Medications/Wishes/Journal/Habits/Cycle
  // pages already use; nothing here changes an API contract. ---

  async function completeTask(taskId: string) {
    const prevStatus = data?.tasks.find((t) => t.taskId === taskId)?.status ?? "todo";
    const updated = await withPending(`task:${taskId}`, () =>
      request<Task>(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) }),
    );
    setData((prev) => prev && { ...prev, tasks: prev.tasks.map((t) => (t.taskId === taskId ? updated : t)) });
    showToast(`"${updated.title}" done`, {
      undo: () => {
        request<Task>(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status: prevStatus }) })
          .then((reverted) => setData((prev) => prev && { ...prev, tasks: prev.tasks.map((t) => (t.taskId === taskId ? reverted : t)) }))
          .catch(() => {});
      },
    });
  }

  // Low-level — PATCHes one step and applies the optimistic update, no toast. Both the
  // single-row path and the bulk (Mark all done / Skip all remaining) paths build on this;
  // the bulk paths show one combined toast instead of one per step.
  async function patchRoutineStep(routineId: string, stepIndex: number, status: RoutineStepLog["status"], note?: string) {
    const key = `routine:${routineId}:${stepIndex}`;
    const updated = await withPending(key, () =>
      request<RoutineStepLog>(`/routine-logs/${today}/${routineId}/${stepIndex}`, {
        method: "PATCH",
        body: JSON.stringify({ status, note: note ?? "" }),
      }),
    );
    setData((prev) => prev && { ...prev, routineRangeLogs: [...prev.routineRangeLogs.filter((l) => l.dateRoutineStep !== updated.dateRoutineStep), updated] });
    return updated;
  }

  function findRoutineLog(routineId: string, stepIndex: number): RoutineStepLog | undefined {
    return data?.routineRangeLogs.find((l) => l.date === today && l.routineId === routineId && l.stepIndex === stepIndex);
  }

  function maybeCelebrateRoutine(routine: RoutineTemplate, updatedSteps: RoutineStepLog[]) {
    if (!data) return;
    const wasComplete = isRoutineComplete(routine, data.routineRangeLogs, today);
    const mergedLogs = [...data.routineRangeLogs.filter((l) => !updatedSteps.some((u) => u.dateRoutineStep === l.dateRoutineStep)), ...updatedSteps];
    const isComplete = isRoutineComplete(routine, mergedLogs, today);
    if (!wasComplete && isComplete) setCelebration(`${routine.name} — all done!`);
  }

  // Shared by the always-visible per-step Done/Skipped/N-A buttons and the inline note save.
  async function setRoutineStepStatus(routine: RoutineTemplate, stepIndex: number, status: RoutineStepLog["status"], note?: string) {
    const prevLog = findRoutineLog(routine.routineId, stepIndex);
    const updated = await patchRoutineStep(routine.routineId, stepIndex, status, note);
    if (status === "done") maybeCelebrateRoutine(routine, [updated]);
    showToast(routineStatusLabel(status, note), {
      undo: () => {
        request<RoutineStepLog>(`/routine-logs/${today}/${routine.routineId}/${stepIndex}`, {
          method: "PATCH",
          body: JSON.stringify({ status: prevLog?.status ?? "skipped", note: prevLog?.note ?? "" }),
        })
          .then((reverted) =>
            setData((prev) => prev && { ...prev, routineRangeLogs: [...prev.routineRangeLogs.filter((l) => l.dateRoutineStep !== reverted.dateRoutineStep), reverted] }),
          )
          .catch(() => {});
      },
    });
  }

  // Only steps with NO log yet today are affected — a step already explicitly Skipped or
  // N/A is left alone, same rule for both "Mark all done" and "Skip all remaining".
  function pendingStepIndexes(routine: RoutineTemplate): number[] {
    return routine.steps.map((_, i) => i).filter((i) => findRoutineLog(routine.routineId, i) === undefined);
  }

  async function markAllDoneSteps(routine: RoutineTemplate) {
    const pendingSteps = pendingStepIndexes(routine);
    if (pendingSteps.length === 0) return;
    const updated = await Promise.all(pendingSteps.map((i) => patchRoutineStep(routine.routineId, i, "done")));
    maybeCelebrateRoutine(routine, updated);
    showToast(`${routine.name}: ${pendingSteps.length} step${pendingSteps.length === 1 ? "" : "s"} marked done`, {
      undo: () => {
        Promise.all(pendingSteps.map((i) => request<RoutineStepLog>(`/routine-logs/${today}/${routine.routineId}/${i}`, { method: "PATCH", body: JSON.stringify({ status: "skipped" }) })))
          .then((reverted) =>
            setData(
              (prev) =>
                prev && {
                  ...prev,
                  routineRangeLogs: [...prev.routineRangeLogs.filter((l) => !reverted.some((r) => r.dateRoutineStep === l.dateRoutineStep)), ...reverted],
                },
            ),
          )
          .catch(() => {});
      },
    });
  }

  async function skipRemainingSteps(routine: RoutineTemplate) {
    const pendingSteps = pendingStepIndexes(routine);
    if (pendingSteps.length === 0) return;
    await Promise.all(pendingSteps.map((i) => patchRoutineStep(routine.routineId, i, "skipped")));
    showToast(`${routine.name}: ${pendingSteps.length} remaining step${pendingSteps.length === 1 ? "" : "s"} skipped`, {
      undo: () => {
        Promise.all(pendingSteps.map((i) => request<RoutineStepLog>(`/routine-logs/${today}/${routine.routineId}/${i}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) })))
          .then((reverted) =>
            setData(
              (prev) =>
                prev && {
                  ...prev,
                  routineRangeLogs: [...prev.routineRangeLogs.filter((l) => !reverted.some((r) => r.dateRoutineStep === l.dateRoutineStep)), ...reverted],
                },
            ),
          )
          .catch(() => {});
      },
    });
  }

  // Low-level — PATCHes one medication log and applies the optimistic update, no toast.
  async function patchMedicationStatus(medicationId: string, status: MedicationLog["status"]) {
    const key = `med:${medicationId}`;
    const updated = await withPending(key, () =>
      request<MedicationLog>(`/medication-logs/${today}/${medicationId}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    );
    setData((prev) => prev && { ...prev, medicationLogs: [...prev.medicationLogs.filter((l) => l.dateMedicationId !== updated.dateMedicationId), updated] });
    return updated;
  }

  function maybeCelebrateMeds(updatedLogs: MedicationLog[]) {
    if (!data) return;
    const applicable = data.medications.filter((m) => appliesOnDate(m.daysOfWeek, new Date(`${today}T00:00:00`)));
    const wasAllTaken = applicable.every((m) => data.medicationLogs.find((l) => l.date === today && l.medicationId === m.medicationId)?.status === "taken");
    const mergedLogs = [...data.medicationLogs.filter((l) => !updatedLogs.some((u) => u.dateMedicationId === l.dateMedicationId)), ...updatedLogs];
    const isAllTaken = applicable.length > 0 && applicable.every((m) => mergedLogs.find((l) => l.date === today && l.medicationId === m.medicationId)?.status === "taken");
    if (!wasAllTaken && isAllTaken) setCelebration("All of today's medications taken!");
  }

  // Shared by every medication status change (one-tap, and Mark all taken).
  async function setMedicationStatus(medicationId: string, status: MedicationLog["status"]) {
    const prevStatus = data?.medicationLogs.find((l) => l.date === today && l.medicationId === medicationId)?.status;
    const medName = data?.medications.find((m) => m.medicationId === medicationId)?.name ?? "Medication";
    const updated = await patchMedicationStatus(medicationId, status);
    if (status === "taken") maybeCelebrateMeds([updated]);
    showToast(`${medName}: ${medicationStatusLabel(status)}`, {
      undo: () => {
        request<MedicationLog>(`/medication-logs/${today}/${medicationId}`, { method: "PATCH", body: JSON.stringify({ status: prevStatus ?? "missed" }) })
          .then((reverted) =>
            setData((prev) => prev && { ...prev, medicationLogs: [...prev.medicationLogs.filter((l) => l.dateMedicationId !== reverted.dateMedicationId), reverted] }),
          )
          .catch(() => {});
      },
    });
  }

  async function markAllMedicationsTaken(medicationIds: string[]) {
    if (medicationIds.length === 0) return;
    const updated = await Promise.all(medicationIds.map((id) => patchMedicationStatus(id, "taken")));
    maybeCelebrateMeds(updated);
    showToast(`${medicationIds.length} medication${medicationIds.length === 1 ? "" : "s"} marked taken`, {
      undo: () => {
        Promise.all(medicationIds.map((id) => request<MedicationLog>(`/medication-logs/${today}/${id}`, { method: "PATCH", body: JSON.stringify({ status: "missed" }) })))
          .then((reverted) =>
            setData(
              (prev) =>
                prev && {
                  ...prev,
                  medicationLogs: [...prev.medicationLogs.filter((l) => !reverted.some((r) => r.dateMedicationId === l.dateMedicationId)), ...reverted],
                },
            ),
          )
          .catch(() => {});
      },
    });
  }

  async function logWater(amountMl: number) {
    const currentWater = data?.habits.find((h) => h.habitType === "water")?.value ?? 0;
    const next = currentWater + amountMl;
    await withPending("water", () => request(`/habits/${today}/water`, { method: "PATCH", body: JSON.stringify({ value: next }) }));
    setData(
      (prev) =>
        prev && {
          ...prev,
          habits: [...prev.habits.filter((h) => h.habitType !== "water"), { ...prev.habits.find((h) => h.habitType === "water"), habitType: "water", value: next } as HabitLog],
        },
    );
    showToast(`+${amountMl}ml water logged`);
  }

  async function logMood(rating: number, note?: string) {
    const current = data?.moodToday[0];
    const updated = await withPending("mood", () =>
      current
        ? request<LogEntry>(`/logs/${current.logId}`, { method: "PATCH", body: JSON.stringify({ data: { rating, note } }) })
        : request<LogEntry>("/logs", { method: "POST", body: JSON.stringify({ logType: "mood", date: today, data: { rating, note } }) }),
    );
    setData((prev) => prev && { ...prev, moodToday: [updated] });
    showToast(`Mood logged: ${rating}/5`);
  }

  async function logPeriodStarted() {
    const entry = await withPending("cycle", () =>
      request<LogEntry>("/logs", { method: "POST", body: JSON.stringify({ logType: "cycle", date: today, data: { event: "period_start" } }) }),
    );
    setData((prev) => prev && { ...prev, cycleToday: [...prev.cycleToday, entry] });
    showToast("Period started logged");
  }

  // --- Derived view model ---

  // Stable per `today` (not per render) so it can sit in useMemo dependency arrays below
  // without defeating the memoization the way a fresh `new Date()` every render would.
  const now = useMemo(() => new Date(`${today}T00:00:00`), [today]);

  const todaysTasks = useMemo(
    () => (data ? data.tasks.filter((t) => t.dueDate === today || (t.dueDate && t.dueDate < today && t.status !== "done")) : []),
    [data, today],
  );
  const tasksDueToday = useMemo(() => (data ? data.tasks.filter((t) => t.dueDate === today) : []), [data, today]);
  const tasksDoneToday = tasksDueToday.filter((t) => t.status === "done").length;

  const applicableRoutines = useMemo(() => (data ? data.routines.filter((r) => appliesOnDate(r.daysOfWeek, now)) : []), [data, now]);
  const routinesTotal = applicableRoutines.reduce((sum, r) => sum + r.steps.length, 0);
  const routineLogsByDateStep = useMemo(() => {
    const map = new Map<string, RoutineStepLog["status"]>();
    for (const log of data?.routineRangeLogs ?? []) map.set(`${log.date}#${log.routineId}#${log.stepIndex}`, log.status);
    return map;
  }, [data]);
  const routinesDone = applicableRoutines.reduce((sum, r) => {
    const doneSteps = r.steps.filter((_, i) => {
      const status = routineLogsByDateStep.get(`${today}#${r.routineId}#${i}`);
      return status === "done" || status === "not_applicable";
    }).length;
    return sum + doneSteps;
  }, 0);
  const routineStreakDays = applicableRoutines.reduce(
    (max, r) => Math.max(max, computeRoutineStreak(r, routineLogsByDateStep)),
    0,
  );

  const applicableMeds = useMemo(() => (data ? data.medications.filter((m) => appliesOnDate(m.daysOfWeek, now)) : []), [data, now]);
  const medStatusByMedId = useMemo(() => {
    const map = new Map<string, MedicationLog["status"]>();
    for (const log of data?.medicationLogs ?? []) map.set(log.medicationId, log.status);
    return map;
  }, [data]);
  const medsDone = applicableMeds.filter((m) => medStatusByMedId.get(m.medicationId) === "taken").length;

  const moodLoggedToday = (data?.moodToday[0]?.data.rating as number | undefined) ?? null;

  const hideCycle = data?.profile?.sex === "male";
  const cycleLoggedToday = (data?.cycleToday ?? []).some((e) => e.data.event === "period_start");
  const journaledToday = (data?.journalToday ?? []).length > 0;

  const waterLogged = (data?.habits ?? []).some((h) => h.habitType === "water");
  const moodLogged = moodLoggedToday !== null;
  const dayFullyLogged = waterLogged && moodLogged && (hideCycle || cycleLoggedToday);
  const isEvening = new Date().getHours() >= loadEveningHour();
  const showLogYourDay = isEvening && !dayFullyLogged;

  const taskRows: TaskRowAction[] = useMemo(
    () =>
      todaysTasks.map((task) => ({
        task,
        overdue: Boolean(task.dueDate && task.dueDate < today && task.status !== "done"),
        pending: isPending(`task:${task.taskId}`),
        onComplete: () => void completeTask(task.taskId),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todaysTasks, today, pendingKeys],
  );

  // The one routine whose timeOfDay is nearest the current time and isn't already fully
  // done gets auto-expanded; every other routine starts visible but collapsed.
  const nextRoutineId = useMemo(() => {
    const nowStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const incomplete = applicableRoutines.filter((r) =>
      r.steps.some((_, i) => {
        const status = routineLogsByDateStep.get(`${today}#${r.routineId}#${i}`);
        return status !== "done" && status !== "not_applicable";
      }),
    );
    if (incomplete.length === 0) return null;
    const upcoming = incomplete.filter((r) => (r.timeOfDay ?? "00:00") >= nowStr).sort((a, b) => (a.timeOfDay ?? "").localeCompare(b.timeOfDay ?? ""));
    return (upcoming[0] ?? incomplete[0]).routineId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicableRoutines, routineLogsByDateStep, today]);

  const routineGroups: RoutineGroup[] = useMemo(
    () =>
      applicableRoutines.map((routine) => {
        const steps: RoutineStepRow[] = routine.steps.map((label, i) => {
          const log = data?.routineRangeLogs.find((l) => l.date === today && l.routineId === routine.routineId && l.stepIndex === i);
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
          initiallyExpanded: routine.routineId === nextRoutineId,
          onSetStatus: (stepIndex, status, note) => setRoutineStepStatus(routine, stepIndex, status, note),
          onMarkAllDone: () => void markAllDoneSteps(routine),
          onSkipRemaining: () => void skipRemainingSteps(routine),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applicableRoutines, data, today, nextRoutineId, pendingKeys],
  );

  const medicationRows: MedicationRow[] = useMemo(
    () =>
      applicableMeds.map((medication) => ({
        medication,
        status: medStatusByMedId.get(medication.medicationId) ?? null,
        pending: isPending(`med:${medication.medicationId}`),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applicableMeds, medStatusByMedId, pendingKeys],
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
        return <TodayHeader streakDays={routineStreakDays} done={tasksDoneToday + routinesDone + medsDone} total={tasksDueToday.length + routinesTotal + applicableMeds.length} />;
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
            <TodayRoutinesSection groups={routineGroups} />
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
              cyclePending={isPending("cycle")}
            />
          </Card>
        ) : null;
      case "habits":
        return <TodayHabits date={today} />;
      case "cycle":
        return hideCycle ? null : <TodayCycle date={today} />;
      case "budget":
        return <BudgetPreview />;
      case "meals":
        return <TodayMeals date={today} />;
      case "expenses":
        return <TodayExpenses date={today} />;
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
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className={pageTitle}>{greeting()}</h1>
          <p className={`-mt-4 ${mutedText}`}>{formattedDate()}</p>
        </div>
        <button
          type="button"
          onClick={() => setCustomizeOpen(true)}
          aria-label="Customize Today"
          className={`${secondaryButton} flex items-center gap-1.5 px-3 py-1.5 text-xs`}
        >
          <Icon icon={SlidersHorizontal} size={13} />
          Customize
        </button>
      </div>

      <WelcomeCard />

      {isEmptyDay ? (
        <EmptyState icon="🌤️" title="Nothing on the books today" hint="Add a task from the + button, or start a routine from the Routines tab." />
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
