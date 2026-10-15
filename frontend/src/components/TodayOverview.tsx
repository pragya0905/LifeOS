import { CheckSquare, Droplet, ListChecks, Pill } from "lucide-react";
import { StatTile } from "./StatTile";
import { ProgressRing } from "./ProgressRing";
import { StreakBadge } from "./StreakBadge";
import { mutedText, sectionLabel } from "./ui";

export interface HabitStreak {
  habitType: string;
  currentStreakDays: number;
}

export function TodayOverview({
  tasksDone,
  tasksTotal,
  routinesDone,
  routinesTotal,
  medsDone,
  medsTotal,
  waterMl,
  waterGoalMl,
  routineStreakDays,
  habitStreaks,
}: {
  tasksDone: number;
  tasksTotal: number;
  routinesDone: number;
  routinesTotal: number;
  medsDone: number;
  medsTotal: number;
  waterMl: number;
  waterGoalMl: number;
  routineStreakDays: number;
  habitStreaks: HabitStreak[];
}) {
  const ratio = (done: number, total: number) => (total > 0 ? done / total : 0);
  const activeStreaks = habitStreaks.filter((h) => h.currentStreakDays > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile icon={CheckSquare} label="Tasks" value={`${tasksDone}/${tasksTotal}`} />
        <StatTile icon={ListChecks} label="Routines" value={`${routinesDone}/${routinesTotal}`} accentClassName="text-routine" />
        <StatTile icon={Pill} label="Meds" value={`${medsDone}/${medsTotal}`} accentClassName="text-medication" />
        <StatTile icon={Droplet} label="Water" value={`${waterMl}ml`} sub={`of ${waterGoalMl}ml`} />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-4">
          <ProgressRing fraction={ratio(routinesDone, routinesTotal)} colorClassName="stroke-routine" size={44} stroke={4.5} label="Routines progress" />
          <ProgressRing fraction={ratio(medsDone, medsTotal)} colorClassName="stroke-medication" size={44} stroke={4.5} label="Medications progress" />
          <ProgressRing fraction={ratio(waterMl, waterGoalMl)} colorClassName="stroke-bloom" size={44} stroke={4.5} label="Water progress" />
        </div>

        <div className="flex flex-1 flex-col items-end gap-1 text-right">
          <p className={sectionLabel}>Streaks</p>
          {routineStreakDays === 0 && activeStreaks.length === 0 ? (
            <p className={mutedText}>None yet today</p>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              {routineStreakDays > 0 && <StreakBadge days={routineStreakDays} />}
              {activeStreaks.map((h) => (
                <span key={h.habitType} className="inline-flex items-center gap-1 text-xs text-ink-muted dark:text-mist-muted">
                  <span className="capitalize">{h.habitType}</span>
                  <StreakBadge days={h.currentStreakDays} unit="d" compact variant="inline" />
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
