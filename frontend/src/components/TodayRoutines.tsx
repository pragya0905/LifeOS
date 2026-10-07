import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../api/useApi";
import { todayLocal } from "../lib/date";
import type { RoutineStepLog, RoutineTemplate } from "../types";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";
import {
  badge,
  card,
  errorText,
  pillButton,
  pillButtonDone,
  pillButtonInactive,
  pillButtonSkipped,
  sectionLabel,
} from "./ui";

// Only the three built-in presets — category is free text (e.g. "bodycare"), so this falls
// back to the raw stored value for anything else rather than showing "undefined".
const CATEGORY_LABEL: Record<string, string> = {
  skinCare: "Skin care",
  hairCare: "Hair care",
  dailyRoutine: "Daily routine",
};

function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category] ?? category;
}

function today(): string {
  return todayLocal();
}

function appliesToday(routine: RoutineTemplate): boolean {
  return !routine.daysOfWeek || routine.daysOfWeek.length === 0 || routine.daysOfWeek.includes(new Date().getDay());
}

export default function TodayRoutines() {
  const { request } = useApi();
  const [routines, setRoutines] = useState<RoutineTemplate[] | null>(null);
  const [stepStatuses, setStepStatuses] = useState<Record<string, RoutineStepLog["status"]>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const [routinesData, logsData] = await Promise.all([
          request<{ routines: RoutineTemplate[] }>("/routines"),
          request<{ logs: RoutineStepLog[] }>(`/routine-logs/${today()}`),
        ]);
        if (ignore) return;
        setRoutines(routinesData.routines);
        const next: Record<string, RoutineStepLog["status"]> = {};
        for (const log of logsData.logs) next[`${log.routineId}#${log.stepIndex}`] = log.status;
        setStepStatuses(next);
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : "Failed to load routines");
      }
    }
    load();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setStepStatus(routineId: string, stepIndex: number, status: RoutineStepLog["status"]) {
    const key = `${routineId}#${stepIndex}`;
    setPending(key);
    setError(null);
    try {
      const updated = await request<RoutineStepLog>(
        `/routine-logs/${today()}/${routineId}/${stepIndex}`,
        { method: "PATCH", body: JSON.stringify({ status }) },
      );
      setStepStatuses((prev) => ({ ...prev, [key]: updated.status }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update step");
    } finally {
      setPending(null);
    }
  }

  const todaysRoutines = routines?.filter(appliesToday) ?? null;

  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className={sectionLabel}>🪞 Today's routines</h2>
        <Link to="/routines" className="text-xs text-bloom hover:underline">
          Manage →
        </Link>
      </div>
      {error && <p className={`mb-2 ${errorText}`}>{error}</p>}
      {!error && !todaysRoutines && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-8 w-full" />
        </div>
      )}
      {todaysRoutines && todaysRoutines.length === 0 && routines?.length === 0 && (
        <EmptyState
          icon="🪞"
          title="No routines yet"
          hint="Add one on the Routines page to see it here each day."
        />
      )}
      {todaysRoutines && todaysRoutines.length === 0 && routines && routines.length > 0 && (
        <EmptyState
          icon="🪞"
          title="Nothing scheduled for today"
          hint="See all routines on the Routines page."
        />
      )}
      {todaysRoutines && todaysRoutines.length > 0 && (
        <ul className="flex flex-col gap-4">
          {todaysRoutines.map((routine) => {
            const doneCount = routine.steps.filter(
              (_, index) => stepStatuses[`${routine.routineId}#${index}`] === "done",
            ).length;
            return (
              <li key={routine.routineId}>
                <p className="mb-1.5 text-sm font-medium text-ink dark:text-paper">
                  {routine.name}{" "}
                  <span className="font-normal text-ink-muted dark:text-mist-muted">
                    ({categoryLabel(routine.category)})
                  </span>{" "}
                  <span className={badge}>
                    {doneCount}/{routine.steps.length} done
                  </span>
                </p>
                <ul className="flex flex-col gap-1.5">
                  {routine.steps.map((step, index) => {
                    const key = `${routine.routineId}#${index}`;
                    const status = stepStatuses[key];
                    return (
                      <li key={key} className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-sm text-ink-muted dark:text-mist-muted">{step}</span>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            disabled={pending === key}
                            onClick={() => setStepStatus(routine.routineId, index, "done")}
                            className={`${pillButton} px-2.5 py-0.5 ${
                              status === "done" ? pillButtonDone : pillButtonInactive
                            }`}
                          >
                            Done
                          </button>
                          <button
                            type="button"
                            disabled={pending === key}
                            onClick={() => setStepStatus(routine.routineId, index, "skipped")}
                            className={`${pillButton} px-2.5 py-0.5 ${
                              status === "skipped" ? pillButtonSkipped : pillButtonInactive
                            }`}
                          >
                            Skipped
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
