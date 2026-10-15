import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useApi } from "../api/useApi";
import { todayLocal } from "../lib/date";
import { appliesOnDate } from "../lib/weekdays";
import { computeRoutineStreak, routineStreakWindowStart } from "../lib/routineStreak";
import { nextWishIncrementPatch, wishRevertPatch } from "../lib/wishProgress";
import {
  defaultModuleConfig,
  loadModuleConfig,
  saveModuleConfig,
  type TodayModuleConfig,
  type TodayModuleId,
} from "../lib/todayModules";
import type {
  Goal,
  HabitLog,
  LogEntry,
  Medication,
  MedicationLog,
  ProgressSummary,
  RoutineStepLog,
  RoutineTemplate,
  Task,
  UserProfile,
  Wish,
} from "../types";
import { Icon } from "../components/Icon";
import { Card } from "../components/Card";
import { useToast } from "../components/Toast";
import { Skeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { TodayOverview } from "../components/TodayOverview";
import { TodayPinnedChips } from "../components/TodayPinnedChips";
import { TodayTimeline, type TimelineItem } from "../components/TodayTimeline";
import { TodayNextUp, type NextUpItem } from "../components/TodayNextUp";
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
import { errorText, mutedText, page, pageTitle, secondaryButton } from "../components/ui";

const DEFAULT_WATER_GOAL_ML = 2000;

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
  goals: Goal[];
  wishes: Wish[];
  profile: UserProfile | null;
  progressSummary: ProgressSummary | null;
  journalToday: LogEntry[];
  cycleToday: LogEntry[];
  moodToday: LogEntry[];
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
      request<{ goals: Goal[] }>("/goals"),
      request<{ wishes: Wish[] }>("/wishes"),
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
          goalsRes,
          wishesRes,
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
            goals: goalsRes.goals,
            wishes: wishesRes.wishes,
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
    const updated = await withPending(`task:${taskId}`, () =>
      request<Task>(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) }),
    );
    setData((prev) => prev && { ...prev, tasks: prev.tasks.map((t) => (t.taskId === taskId ? updated : t)) });
  }

  async function addTask(title: string) {
    const task = await request<Task>("/tasks", {
      method: "POST",
      body: JSON.stringify({ title, dueDate: today, dueTime: "23:59" }),
    });
    setData((prev) => prev && { ...prev, tasks: [...prev.tasks, task] });
  }

  async function completeRoutineStep(routineId: string, stepIndex: number) {
    const key = `routine:${routineId}:${stepIndex}`;
    const updated = await withPending(key, () =>
      request<RoutineStepLog>(`/routine-logs/${today}/${routineId}/${stepIndex}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "done" }),
      }),
    );
    setData((prev) => prev && { ...prev, routineRangeLogs: [...prev.routineRangeLogs.filter((l) => l.dateRoutineStep !== updated.dateRoutineStep), updated] });
  }

  async function completeMedication(medicationId: string) {
    const key = `med:${medicationId}`;
    const updated = await withPending(key, () =>
      request<MedicationLog>(`/medication-logs/${today}/${medicationId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "taken" }),
      }),
    );
    setData((prev) => prev && { ...prev, medicationLogs: [...prev.medicationLogs.filter((l) => l.dateMedicationId !== updated.dateMedicationId), updated] });
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
  }

  async function logMood(rating: number) {
    const current = data?.moodToday[0];
    const updated = await withPending("mood", () =>
      current
        ? request<LogEntry>(`/logs/${current.logId}`, { method: "PATCH", body: JSON.stringify({ data: { rating } }) })
        : request<LogEntry>("/logs", { method: "POST", body: JSON.stringify({ logType: "mood", date: today, data: { rating } }) }),
    );
    setData((prev) => prev && { ...prev, moodToday: [updated] });
  }

  async function logPeriodStarted() {
    await withPending("cycle", () =>
      request<LogEntry>("/logs", { method: "POST", body: JSON.stringify({ logType: "cycle", date: today, data: { event: "period_start" } }) }),
    ).then((entry) => {
      setData((prev) => prev && { ...prev, cycleToday: [...prev.cycleToday, entry] });
    });
  }

  async function incrementWish(wish: Wish) {
    const patch = nextWishIncrementPatch(wish);
    if (!patch) return;
    const updated = await withPending(`wish:${wish.wishId}`, () =>
      request<Wish>(`/wishes/${wish.wishId}`, { method: "PATCH", body: JSON.stringify(patch) }),
    );
    setData((prev) => prev && { ...prev, wishes: prev.wishes.map((w) => (w.wishId === wish.wishId ? updated : w)) });
    showToast(`"${wish.title}" progress updated`, {
      undo: () => {
        request<Wish>(`/wishes/${wish.wishId}`, { method: "PATCH", body: JSON.stringify(wishRevertPatch(wish)) })
          .then((reverted) => setData((prev) => prev && { ...prev, wishes: prev.wishes.map((w) => (w.wishId === wish.wishId ? reverted : w)) }))
          .catch(() => {});
      },
    });
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
  const medsTakenIds = useMemo(
    () => new Set((data?.medicationLogs ?? []).filter((l) => l.status === "taken").map((l) => l.medicationId)),
    [data],
  );
  const medsDone = applicableMeds.filter((m) => medsTakenIds.has(m.medicationId)).length;

  const waterMl = data?.habits.find((h) => h.habitType === "water")?.value ?? 0;
  const waterGoalMl = data?.goals.find((g) => g.metric === "water")?.targetValue ?? DEFAULT_WATER_GOAL_ML;
  const moodLoggedToday = (data?.moodToday[0]?.data.rating as number | undefined) ?? null;

  const hideCycle = data?.profile?.sex === "male";
  const cycleLoggedToday = (data?.cycleToday ?? []).some((e) => e.data.event === "period_start");
  const journaledToday = (data?.journalToday ?? []).length > 0;

  const mostRecentWish = useMemo(() => {
    if (!data) return null;
    return (
      data.wishes
        .filter((w) => w.status === "active")
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0] ?? null
    );
  }, [data]);

  const timelineItems: TimelineItem[] = useMemo(() => {
    if (!data) return [];
    const items: TimelineItem[] = [];

    for (const task of todaysTasks) {
      const overdue = Boolean(task.dueDate && task.dueDate < today && task.status !== "done");
      items.push({
        key: `task:${task.taskId}`,
        time: task.dueTime ?? task.scheduleTime ?? null,
        domain: "task",
        label: task.title,
        sublabel: overdue ? `Overdue — was due ${task.dueDate}` : task.dueTime ? undefined : task.scheduleTime,
        completed: task.status === "done",
        overdue,
        pending: isPending(`task:${task.taskId}`),
        onComplete: () => void completeTask(task.taskId),
      });
    }

    for (const routine of applicableRoutines) {
      routine.steps.forEach((step, i) => {
        const status = routineLogsByDateStep.get(`${today}#${routine.routineId}#${i}`);
        const completed = status === "done" || status === "not_applicable";
        items.push({
          key: `routine:${routine.routineId}:${i}`,
          time: routine.timeOfDay ?? null,
          domain: "routine",
          label: step,
          sublabel: routine.name,
          completed,
          pending: isPending(`routine:${routine.routineId}:${i}`),
          onComplete: () => void completeRoutineStep(routine.routineId, i),
        });
      });
    }

    for (const med of applicableMeds) {
      items.push({
        key: `med:${med.medicationId}`,
        time: med.timeOfDay ?? null,
        domain: "medication",
        label: med.name,
        sublabel: med.dosage,
        completed: medsTakenIds.has(med.medicationId),
        pending: isPending(`med:${med.medicationId}`),
        onComplete: () => void completeMedication(med.medicationId),
      });
    }

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, todaysTasks, applicableRoutines, applicableMeds, routineLogsByDateStep, medsTakenIds, pendingKeys]);

  const nextUp: NextUpItem | null = useMemo(() => {
    if (!data) return null;

    const overdueHigh = todaysTasks.find((t) => t.status !== "done" && t.priority === "High" && t.dueDate && t.dueDate < today);
    if (overdueHigh) {
      return {
        label: overdueHigh.title,
        sublabel: `Overdue — was due ${overdueHigh.dueDate}`,
        domain: "task",
        actionLabel: "Mark done",
        pending: isPending(`task:${overdueHigh.taskId}`),
        onAction: () => void completeTask(overdueHigh.taskId),
      };
    }

    const nextTask = tasksDueToday
      .filter((t) => t.status !== "done")
      .sort((a, b) => (a.dueTime ?? "23:59").localeCompare(b.dueTime ?? "23:59"))[0];
    if (nextTask) {
      return {
        label: nextTask.title,
        sublabel: nextTask.dueTime ? `Due ${nextTask.dueTime}` : "Due today",
        domain: "task",
        actionLabel: "Mark done",
        pending: isPending(`task:${nextTask.taskId}`),
        onAction: () => void completeTask(nextTask.taskId),
      };
    }

    const nextRoutine = applicableRoutines
      .slice()
      .sort((a, b) => (a.timeOfDay ?? "99:99").localeCompare(b.timeOfDay ?? "99:99"))
      .flatMap((r) => r.steps.map((step, i) => ({ routine: r, step, i })))
      .find(({ routine, i }) => {
        const status = routineLogsByDateStep.get(`${today}#${routine.routineId}#${i}`);
        return status !== "done" && status !== "not_applicable";
      });
    if (nextRoutine) {
      return {
        label: nextRoutine.step,
        sublabel: nextRoutine.routine.name,
        domain: "routine",
        actionLabel: "Mark done",
        pending: isPending(`routine:${nextRoutine.routine.routineId}:${nextRoutine.i}`),
        onAction: () => void completeRoutineStep(nextRoutine.routine.routineId, nextRoutine.i),
      };
    }

    const nextMed = applicableMeds
      .slice()
      .sort((a, b) => (a.timeOfDay ?? "99:99").localeCompare(b.timeOfDay ?? "99:99"))
      .find((m) => !medsTakenIds.has(m.medicationId));
    if (nextMed) {
      return {
        label: nextMed.name,
        sublabel: nextMed.timeOfDay ? `Scheduled ${nextMed.timeOfDay}` : undefined,
        domain: "medication",
        actionLabel: "Mark taken",
        pending: isPending(`med:${nextMed.medicationId}`),
        onAction: () => void completeMedication(nextMed.medicationId),
      };
    }

    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, todaysTasks, tasksDueToday, applicableRoutines, applicableMeds, routineLogsByDateStep, medsTakenIds, pendingKeys]);

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
    return (
      <div className={page}>
        <Skeleton className="mb-2 h-8 w-48" />
        <Skeleton className="mb-6 h-4 w-32" />
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <Skeleton className="mb-4 h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const isEmptyDay =
    timelineItems.length === 0 && !mostRecentWish && applicableRoutines.length === 0 && applicableMeds.length === 0;

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

      {!isEmptyDay && (
        <Card className="mb-4">
          <TodayOverview
            tasksDone={tasksDoneToday}
            tasksTotal={tasksDueToday.length}
            routinesDone={routinesDone}
            routinesTotal={routinesTotal}
            medsDone={medsDone}
            medsTotal={applicableMeds.length}
            waterMl={waterMl}
            waterGoalMl={waterGoalMl}
            routineStreakDays={routineStreakDays}
            habitStreaks={data.progressSummary?.habits ?? []}
          />
        </Card>
      )}

      <div className="mb-4">
        <TodayPinnedChips
          onLogWater={(amount) => void logWater(amount)}
          waterPending={isPending("water")}
          onLogMood={(rating) => void logMood(rating)}
          moodPending={isPending("mood")}
          moodLoggedToday={moodLoggedToday}
          showCycleChip={!hideCycle}
          cycleLoggedToday={cycleLoggedToday}
          onLogPeriodStarted={() => void logPeriodStarted()}
          cyclePending={isPending("cycle")}
          mostRecentWish={mostRecentWish}
          onIncrementWish={() => mostRecentWish && void incrementWish(mostRecentWish)}
          wishPending={mostRecentWish ? isPending(`wish:${mostRecentWish.wishId}`) : false}
          onAddTask={(title) => void addTask(title)}
          taskAddPending={false}
        />
      </div>

      {isEmptyDay ? (
        <EmptyState
          icon="🌤️"
          title="Nothing on the books today"
          hint="Add a task above, or start a routine from the Routines tab."
        />
      ) : (
        <>
          <Card className="mb-4">
            <TodayTimeline items={timelineItems} isToday />
          </Card>

          <div className="mb-4">
            <TodayNextUp item={nextUp} />
          </div>
        </>
      )}

      <div className="flex flex-col gap-4">
        {modules.filter((m) => m.visible).map((m) => {
          const rendered = renderModule(m.id);
          return rendered ? <div key={m.id}>{rendered}</div> : null;
        })}
      </div>

      <TodayCustomizePanel
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        modules={modules}
        onToggleVisible={toggleModuleVisible}
        onMove={moveModule}
        onReset={resetModules}
      />
    </div>
  );
}
