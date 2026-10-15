import { useState, type FormEvent } from "react";
import { Moon } from "lucide-react";
import { Chip } from "./Chip";
import { Icon } from "./Icon";
import { input, mutedText } from "./ui";

const MOOD_FACES = ["😩", "🙁", "😐", "🙂", "😄"];

export function TodayLogYourDay({
  onLogWater,
  waterPending,
  onLogMood,
  moodPending,
  moodLoggedToday,
  showCycleChip,
  cycleLoggedToday,
  onLogPeriodStarted,
  cyclePending,
}: {
  onLogWater: (amountMl: number) => void;
  waterPending: boolean;
  onLogMood: (rating: number, note?: string) => void;
  moodPending: boolean;
  moodLoggedToday: number | null;
  showCycleChip: boolean;
  cycleLoggedToday: boolean;
  onLogPeriodStarted: () => void;
  cyclePending: boolean;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [note, setNote] = useState("");

  function submitCustom(e: FormEvent) {
    e.preventDefault();
    const amount = Number(customAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    onLogWater(amount);
    setCustomAmount("");
    setCustomOpen(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-1.5 text-xs font-medium text-ink-muted dark:text-mist-muted">Water</p>
        <div className="flex flex-wrap items-center gap-2">
          <Chip disabled={waterPending} onClick={() => onLogWater(250)}>+250ml</Chip>
          <Chip disabled={waterPending} onClick={() => onLogWater(500)}>+500ml</Chip>
          <Chip active={customOpen} onClick={() => setCustomOpen((v) => !v)}>Custom</Chip>
        </div>
        {customOpen && (
          <form onSubmit={submitCustom} className="mt-2 flex gap-2">
            <input
              type="number"
              min={1}
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              placeholder="ml"
              autoFocus
              className={`w-24 ${input}`}
            />
            <button type="submit" disabled={waterPending || !customAmount} className="min-h-10 rounded-control bg-bloom px-4 text-xs font-medium text-paper-card hover:bg-bloom-light disabled:opacity-50">
              Log
            </button>
          </form>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-ink-muted dark:text-mist-muted">Mood</p>
        <div className="flex gap-2">
          {MOOD_FACES.map((face, i) => {
            const rating = i + 1;
            const active = moodLoggedToday === rating;
            return (
              <button
                key={rating}
                type="button"
                disabled={moodPending}
                onClick={() => onLogMood(rating, note.trim() || undefined)}
                aria-pressed={active}
                aria-label={`Mood rating ${rating}`}
                className={`flex h-11 w-11 items-center justify-center rounded-full border text-lg transition-colors disabled:opacity-60 ${
                  active ? "border-bloom bg-bloom-soft dark:bg-bloom-soft-dark" : "border-stone hover:bg-stone/40 dark:border-stone-dark dark:hover:bg-stone-dark/40"
                }`}
              >
                {face}
              </button>
            );
          })}
        </div>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          maxLength={200}
          className={`mt-2 w-full text-xs ${input}`}
        />
      </div>

      {showCycleChip && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-ink-muted dark:text-mist-muted">Cycle</p>
          <Chip disabled={cyclePending || cycleLoggedToday} onClick={onLogPeriodStarted}>
            <Icon icon={Moon} size={13} />
            {cycleLoggedToday ? "Period started ✓" : "Period started today"}
          </Chip>
        </div>
      )}

      <p className={mutedText}>This card hides itself once everything's logged — also reachable anytime from the + button.</p>
    </div>
  );
}
