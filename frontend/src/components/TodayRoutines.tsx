import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, Timer } from "lucide-react";
import { useApi } from "../api/useApi";
import { appliesOnDate } from "../lib/weekdays";
import type { RoutineStepLog, RoutineTemplate } from "../types";
import { EmptyState } from "./EmptyState";
import { Icon } from "./Icon";
import { Skeleton } from "./Skeleton";
import {
  badge,
  card,
  errorText,
  input,
  mutedText,
  pillButton,
  pillButtonDone,
  pillButtonInactive,
  pillButtonNotApplicable,
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

export default function TodayRoutines({ date }: { date: string }) {
  const { request } = useApi();
  const [routines, setRoutines] = useState<RoutineTemplate[] | null>(null);
  const [stepLogs, setStepLogs] = useState<Record<string, { status: RoutineStepLog["status"]; note?: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const [routinesData, logsData] = await Promise.all([
          request<{ routines: RoutineTemplate[] }>("/routines"),
          request<{ logs: RoutineStepLog[] }>(`/routine-logs/${date}`),
        ]);
        if (ignore) return;
        setRoutines(routinesData.routines);
        const next: Record<string, { status: RoutineStepLog["status"]; note?: string }> = {};
        for (const log of logsData.logs) next[`${log.routineId}#${log.stepIndex}`] = { status: log.status, note: log.note };
        setStepLogs(next);
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : "Failed to load routines");
      }
    }
    load();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function setStepStatus(
    routineId: string,
    stepIndex: number,
    status: RoutineStepLog["status"],
    note?: string,
  ) {
    const key = `${routineId}#${stepIndex}`;
    setPending(key);
    setError(null);
    try {
      const updated = await request<RoutineStepLog>(
        `/routine-logs/${date}/${routineId}/${stepIndex}`,
        { method: "PATCH", body: JSON.stringify({ status, ...(note !== undefined ? { note } : {}) }) },
      );
      setStepLogs((prev) => ({ ...prev, [key]: { status: updated.status, note: updated.note } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update step");
    } finally {
      setPending(null);
    }
  }

  // Routines with no time set sort to the end, after every timed one in ascending order —
  // "HH:MM" strings already sort correctly lexicographically, no parsing needed. Same pattern
  // as TodayMedications' time sort.
  const todaysRoutines =
    routines
      ?.filter((r) => appliesOnDate(r.daysOfWeek, new Date(`${date}T00:00:00`)))
      .sort((a, b) => {
        if (!a.timeOfDay && !b.timeOfDay) return 0;
        if (!a.timeOfDay) return 1;
        if (!b.timeOfDay) return -1;
        return a.timeOfDay.localeCompare(b.timeOfDay);
      }) ?? null;

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
              (_, index) => stepLogs[`${routine.routineId}#${index}`]?.status === "done",
            ).length;
            return (
              <li key={routine.routineId}>
                <p className="mb-1.5 text-sm font-medium text-ink dark:text-paper">
                  {routine.timeOfDay && (
                    <span className={`mr-1 inline-flex items-center gap-1 ${mutedText}`}>
                      <Icon icon={Clock} size={12} /> {routine.timeOfDay}
                    </span>
                  )}
                  {routine.name}{" "}
                  <span className="font-normal text-ink-muted dark:text-mist-muted">
                    ({categoryLabel(routine.category)})
                  </span>{" "}
                  <span className={badge}>
                    {doneCount}/{routine.steps.length} done
                  </span>{" "}
                  {routine.estimatedMinutes !== undefined && (
                    <span className={`${badge} inline-flex items-center gap-1`}>
                      <Icon icon={Timer} size={12} />~{routine.estimatedMinutes} min
                    </span>
                  )}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {routine.steps.map((step, index) => {
                    const key = `${routine.routineId}#${index}`;
                    const log = stepLogs[key];
                    const status = log?.status;
                    return (
                      <li key={key} className="flex flex-col gap-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
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
                            <button
                              type="button"
                              disabled={pending === key}
                              onClick={() => setStepStatus(routine.routineId, index, "not_applicable")}
                              title="Doesn't apply today — won't break the streak"
                              className={`${pillButton} px-2.5 py-0.5 ${
                                status === "not_applicable" ? pillButtonNotApplicable : pillButtonInactive
                              }`}
                            >
                              N/A
                            </button>
                          </div>
                        </div>
                        {status === "not_applicable" && (
                          <input
                            type="text"
                            defaultValue={log?.note ?? ""}
                            onBlur={(e) => {
                              const trimmed = e.target.value.trim();
                              if (trimmed !== (log?.note ?? "")) {
                                setStepStatus(routine.routineId, index, "not_applicable", trimmed);
                              }
                            }}
                            placeholder="Why not applicable? (optional)"
                            maxLength={200}
                            className={`py-1 text-xs ${input}`}
                          />
                        )}
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
