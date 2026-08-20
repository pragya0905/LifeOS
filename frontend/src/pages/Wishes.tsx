import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../api/useApi";
import WishImageGallery from "../components/WishImageGallery";
import { todayLocal } from "../lib/date";
import type { Wish, WishHabitType, WishMilestone, WishProgressMode, WishType } from "../types";
import {
  badge,
  card,
  errorText,
  input,
  label,
  mutedText,
  page,
  pageTitle,
  primaryButton,
  secondaryButton,
  sectionLabel,
} from "../components/ui";

const WISH_TYPE_LABEL: Record<WishType, string> = {
  learning: "Learning",
  travel: "Travel",
  savings: "Savings",
  health: "Health",
  shopping: "Shopping",
  creative: "Creative",
  personal_growth: "Personal growth",
  achievement: "Achievement",
};
const WISH_TYPES = Object.keys(WISH_TYPE_LABEL) as WishType[];

const PROGRESS_MODE_LABEL: Record<WishProgressMode, string> = {
  percentage: "Percentage",
  milestone: "Milestones",
  habit_linked: "Linked to a habit",
  time_based: "Countdown to a date",
  quantity: "Quantity",
};
const PROGRESS_MODES = Object.keys(PROGRESS_MODE_LABEL) as WishProgressMode[];

const HABIT_TYPE_LABEL: Record<WishHabitType, string> = {
  water: "Water",
  exercise: "Exercise",
  steps: "Steps",
};
const HABIT_TYPES = Object.keys(HABIT_TYPE_LABEL) as WishHabitType[];

function daysUntil(dateStr: string): number {
  const today = todayLocal();
  const ms = new Date(`${dateStr}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function newMilestoneId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Module-level (not nested in Wishes) so React keeps element identity across
// re-renders — the same lesson learned earlier this session with GoalTarget/DoneCheck.
function WishCard({
  wish,
  onUpdate,
  onDelete,
}: {
  wish: Wish;
  onUpdate: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [percentDraft, setPercentDraft] = useState(wish.percentage ?? 0);
  const [quantityDraft, setQuantityDraft] = useState(String(wish.quantityCurrent ?? 0));
  const [newMilestoneText, setNewMilestoneText] = useState("");

  function toggleMilestone(id: string) {
    const next = (wish.milestones ?? []).map((m) => (m.id === id ? { ...m, done: !m.done } : m));
    onUpdate({ milestones: next });
  }

  function addMilestone() {
    if (!newMilestoneText.trim()) return;
    const next: WishMilestone[] = [
      ...(wish.milestones ?? []),
      { id: newMilestoneId(), text: newMilestoneText.trim(), done: false },
    ];
    onUpdate({ milestones: next });
    setNewMilestoneText("");
  }

  const doneMilestones = (wish.milestones ?? []).filter((m) => m.done).length;
  const totalMilestones = wish.milestones?.length ?? 0;

  return (
    <li className={`flex flex-col gap-3 ${card} ${wish.status !== "active" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={`font-medium text-ink dark:text-paper ${wish.status === "abandoned" ? "line-through" : ""}`}>
            {wish.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={badge}>{WISH_TYPE_LABEL[wish.type]}</span>
            {wish.targetDate && (
              <span className="text-xs text-ink-muted dark:text-mist-muted">
                Due {wish.targetDate}
                {daysUntil(wish.targetDate) >= 0
                  ? ` (${daysUntil(wish.targetDate)}d left)`
                  : ` (${-daysUntil(wish.targetDate)}d overdue)`}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {wish.status === "active" ? (
            <button
              type="button"
              onClick={() => onUpdate({ status: "abandoned" })}
              className={`${secondaryButton} px-2 py-1 text-xs`}
            >
              Abandon
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onUpdate({ status: "active" })}
              className={`${secondaryButton} px-2 py-1 text-xs`}
            >
              Reactivate
            </button>
          )}
          <button type="button" onClick={onDelete} className={`${secondaryButton} px-2 py-1 text-xs`}>
            Delete
          </button>
        </div>
      </div>

      {wish.status === "completed" && <span className={badge}>Completed</span>}

      {wish.progressMode === "percentage" && (
        <div>
          <input
            type="range"
            min={0}
            max={100}
            value={percentDraft}
            onChange={(e) => setPercentDraft(Number(e.target.value))}
            onMouseUp={() => onUpdate({ percentage: percentDraft })}
            onTouchEnd={() => onUpdate({ percentage: percentDraft })}
            className="w-full"
            aria-label={`${wish.title} progress percentage`}
          />
          <p className={mutedText}>{percentDraft}%</p>
        </div>
      )}

      {wish.progressMode === "milestone" && (
        <div className="flex flex-col gap-1.5">
          <p className={mutedText}>
            {doneMilestones}/{totalMilestones} done
          </p>
          <ul className="flex flex-col gap-1">
            {(wish.milestones ?? []).map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={m.done}
                  onChange={() => toggleMilestone(m.id)}
                  className="h-4 w-4 rounded border-stone text-bloom accent-bloom dark:border-stone-dark"
                />
                <span className={`text-sm ${m.done ? "text-ink-muted line-through dark:text-mist-muted" : "text-ink dark:text-paper"}`}>
                  {m.text}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newMilestoneText}
              onChange={(e) => setNewMilestoneText(e.target.value)}
              placeholder="Add a milestone..."
              className={`flex-1 py-1 text-xs ${input}`}
            />
            <button type="button" onClick={addMilestone} className={`${secondaryButton} px-2 py-1 text-xs`}>
              Add
            </button>
          </div>
        </div>
      )}

      {wish.progressMode === "quantity" && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={quantityDraft}
            onChange={(e) => setQuantityDraft(e.target.value)}
            onBlur={() => onUpdate({ quantityCurrent: Number(quantityDraft) || 0 })}
            className={`w-20 py-1 ${input}`}
            aria-label={`${wish.title} current quantity`}
          />
          <span className={mutedText}>
            of {wish.quantityTarget} {wish.quantityUnit ?? ""}
          </span>
        </div>
      )}

      {wish.progressMode === "habit_linked" && (
        <p className={mutedText}>
          {wish.habitLinkedProgress ?? 0}% — {HABIT_TYPE_LABEL[wish.linkedHabitType as WishHabitType]} toward{" "}
          {wish.habitLinkTargetValue} total since this wish was created
        </p>
      )}

      {wish.progressMode === "time_based" && wish.targetDate && (
        <p className={mutedText}>
          {daysUntil(wish.targetDate) >= 0
            ? `${daysUntil(wish.targetDate)} days remaining`
            : `${-daysUntil(wish.targetDate)} days overdue`}
        </p>
      )}

      <WishImageGallery wishId={wish.wishId} />
    </li>
  );
}

export default function Wishes() {
  const { request } = useApi();
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [type, setType] = useState<WishType>("learning");
  const [progressMode, setProgressMode] = useState<WishProgressMode>("percentage");
  const [targetDate, setTargetDate] = useState("");
  const [quantityTarget, setQuantityTarget] = useState("");
  const [quantityUnit, setQuantityUnit] = useState("");
  const [linkedHabitType, setLinkedHabitType] = useState<WishHabitType>("water");
  const [habitLinkTargetValue, setHabitLinkTargetValue] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await request<{ wishes: Wish[] }>("/wishes");
        if (!ignore) setWishes(data.wishes);
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : "Failed to load wishes");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (progressMode === "time_based" && !targetDate) {
      setError("A target date is required for a countdown wish");
      return;
    }
    if (progressMode === "quantity" && !quantityTarget) {
      setError("A target quantity is required");
      return;
    }
    if (progressMode === "habit_linked" && !habitLinkTargetValue) {
      setError("A habit target value is required");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const wish = await request<Wish>("/wishes", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          type,
          progressMode,
          targetDate: targetDate || undefined,
          quantityTarget: quantityTarget ? Number(quantityTarget) : undefined,
          quantityUnit: quantityUnit || undefined,
          linkedHabitType: progressMode === "habit_linked" ? linkedHabitType : undefined,
          habitLinkTargetValue: habitLinkTargetValue ? Number(habitLinkTargetValue) : undefined,
        }),
      });
      setWishes((prev) => [wish, ...prev]);
      setTitle("");
      setTargetDate("");
      setQuantityTarget("");
      setQuantityUnit("");
      setHabitLinkTargetValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create wish");
    } finally {
      setCreating(false);
    }
  }

  async function updateWish(wishId: string, patch: Record<string, unknown>) {
    setError(null);
    try {
      const updated = await request<Wish>(`/wishes/${wishId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setWishes((prev) => prev.map((w) => (w.wishId === wishId ? updated : w)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update wish");
    }
  }

  async function deleteWish(wishId: string) {
    setError(null);
    try {
      await request(`/wishes/${wishId}`, { method: "DELETE" });
      setWishes((prev) => prev.filter((w) => w.wishId !== wishId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete wish");
    }
  }

  const activeWishes = wishes.filter((w) => w.status === "active");
  const otherWishes = wishes.filter((w) => w.status !== "active");

  return (
    <div className={page}>
      <h1 className={pageTitle}>Wishes</h1>
      <p className={`mb-6 ${mutedText}`}>
        Goals and dreams tracked with real progress — pick whichever tracking style fits: a
        percentage slider, a milestone checklist, tied to a daily habit, a countdown, or a
        quantity target.
      </p>

      <form onSubmit={handleCreate} className={`mb-8 flex flex-col gap-3 ${card}`}>
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[200px] flex-1">
            <label className={label}>Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Learn Spanish"
              className={`w-full ${input}`}
            />
          </div>
          <div>
            <label className={label}>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as WishType)} className={input}>
              {WISH_TYPES.map((t) => (
                <option key={t} value={t}>
                  {WISH_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Track progress by</label>
            <select
              value={progressMode}
              onChange={(e) => setProgressMode(e.target.value as WishProgressMode)}
              className={input}
            >
              {PROGRESS_MODES.map((m) => (
                <option key={m} value={m}>
                  {PROGRESS_MODE_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={label}>Target date {progressMode === "time_based" ? "" : "(optional)"}</label>
            <input
              type="date"
              required={progressMode === "time_based"}
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className={input}
            />
          </div>
          {progressMode === "quantity" && (
            <>
              <div>
                <label className={label}>Target amount</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={quantityTarget}
                  onChange={(e) => setQuantityTarget(e.target.value)}
                  className={`w-24 ${input}`}
                />
              </div>
              <div>
                <label className={label}>Unit</label>
                <input
                  type="text"
                  value={quantityUnit}
                  onChange={(e) => setQuantityUnit(e.target.value)}
                  placeholder="books, km, $"
                  className={`w-28 ${input}`}
                />
              </div>
            </>
          )}
          {progressMode === "habit_linked" && (
            <>
              <div>
                <label className={label}>Habit</label>
                <select
                  value={linkedHabitType}
                  onChange={(e) => setLinkedHabitType(e.target.value as WishHabitType)}
                  className={input}
                >
                  {HABIT_TYPES.map((h) => (
                    <option key={h} value={h}>
                      {HABIT_TYPE_LABEL[h]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>Target total (since creation)</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={habitLinkTargetValue}
                  onChange={(e) => setHabitLinkTargetValue(e.target.value)}
                  className={`w-32 ${input}`}
                />
              </div>
            </>
          )}
          <button type="submit" disabled={creating} className={primaryButton}>
            {creating ? "Adding..." : "Add wish"}
          </button>
        </div>
      </form>

      {error && <p className={`mb-4 ${errorText}`}>{error}</p>}

      {loading ? (
        <p className={mutedText}>Loading wishes...</p>
      ) : wishes.length === 0 ? (
        <p className={mutedText}>No wishes yet — add one above.</p>
      ) : (
        <>
          <h2 className={`mb-2 ${sectionLabel}`}>Active</h2>
          {activeWishes.length === 0 ? (
            <p className={`mb-6 ${mutedText}`}>Nothing active.</p>
          ) : (
            <ul className="mb-6 flex flex-col gap-3">
              {activeWishes.map((wish) => (
                <WishCard
                  key={wish.wishId}
                  wish={wish}
                  onUpdate={(patch) => updateWish(wish.wishId, patch)}
                  onDelete={() => deleteWish(wish.wishId)}
                />
              ))}
            </ul>
          )}

          {otherWishes.length > 0 && (
            <>
              <h2 className={`mb-2 ${sectionLabel}`}>Completed / abandoned</h2>
              <ul className="flex flex-col gap-3">
                {otherWishes.map((wish) => (
                  <WishCard
                    key={wish.wishId}
                    wish={wish}
                    onUpdate={(patch) => updateWish(wish.wishId, patch)}
                    onDelete={() => deleteWish(wish.wishId)}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
