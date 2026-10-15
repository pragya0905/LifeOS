import { useState, type FormEvent } from "react";
import { Droplet, Plus, Smile } from "lucide-react";
import type { Wish } from "../types";
import { wishIsIncrementable } from "../lib/wishProgress";
import { Chip } from "./Chip";
import { Icon } from "./Icon";
import { input } from "./ui";

const WATER_STEP_ML = 250;

export function TodayPinnedChips({
  onLogWater,
  waterPending,
  onLogMood,
  moodPending,
  moodLoggedToday,
  showCycleChip,
  cycleLoggedToday,
  onLogPeriodStarted,
  cyclePending,
  mostRecentWish,
  onIncrementWish,
  wishPending,
  onAddTask,
  taskAddPending,
}: {
  onLogWater: (amountMl: number) => void;
  waterPending: boolean;
  onLogMood: (rating: number) => void;
  moodPending: boolean;
  moodLoggedToday: number | null;
  showCycleChip: boolean;
  cycleLoggedToday: boolean;
  onLogPeriodStarted: () => void;
  cyclePending: boolean;
  mostRecentWish: Wish | null;
  onIncrementWish: () => void;
  wishPending: boolean;
  onAddTask: (title: string) => void;
  taskAddPending: boolean;
}) {
  const [moodOpen, setMoodOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");

  function handleAddTask(e: FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    onAddTask(taskTitle.trim());
    setTaskTitle("");
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2">
        <Chip onClick={() => onLogWater(WATER_STEP_ML)} disabled={waterPending}>
          <Icon icon={Droplet} size={13} />+{WATER_STEP_ML}ml
        </Chip>

        <Chip active={moodOpen} onClick={() => setMoodOpen((v) => !v)}>
          <Icon icon={Smile} size={13} />
          {moodLoggedToday ? `Mood: ${moodLoggedToday}/5` : "Mood"}
        </Chip>

        {showCycleChip && (
          <Chip active={cycleLoggedToday} disabled={cyclePending || cycleLoggedToday} onClick={onLogPeriodStarted}>
            {cycleLoggedToday ? "Period started ✓" : "Period started today"}
          </Chip>
        )}

        {mostRecentWish && wishIsIncrementable(mostRecentWish) && (
          <Chip disabled={wishPending} onClick={onIncrementWish}>
            Continue "{mostRecentWish.title}"
          </Chip>
        )}
      </div>

      {moodOpen && (
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              disabled={moodPending}
              onClick={() => {
                onLogMood(n);
                setMoodOpen(false);
              }}
              aria-label={`Mood rating ${n}`}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-stone text-sm font-medium text-ink transition-colors hover:bg-stone/40 disabled:opacity-50 dark:border-stone-dark dark:text-paper dark:hover:bg-stone-dark/40"
            >
              {n}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleAddTask} className="flex items-center gap-2">
        <input
          type="text"
          value={taskTitle}
          onChange={(e) => setTaskTitle(e.target.value)}
          placeholder="Add a task and hit Enter — due by end of today"
          className={`flex-1 ${input}`}
        />
        <button
          type="submit"
          disabled={taskAddPending || !taskTitle.trim()}
          aria-label="Add task"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bloom text-paper-card transition-colors hover:bg-bloom-light disabled:opacity-50"
        >
          <Icon icon={Plus} size={18} />
        </button>
      </form>
    </div>
  );
}
