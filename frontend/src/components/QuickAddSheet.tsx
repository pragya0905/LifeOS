import { useEffect, useRef, useState } from "react";
import { useLocation, type Location } from "react-router-dom";
import {
  CheckSquare,
  Droplet,
  ListChecks,
  NotebookPen,
  Pill,
  Receipt,
  Smile,
  Target,
  Mic,
  MicOff,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { useApi } from "../api/useApi";
import { useToast } from "./Toast";
import { useSpeechToText } from "../hooks/useSpeechToText";
import { computeDueAtUtc, END_OF_DAY_TIME, isValidDateStr, todayLocal } from "../lib/date";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_EMOJI, EXPENSE_CATEGORY_LABEL } from "../lib/expenseCategories";
import { nextWishIncrementPatch, wishIsIncrementable, wishRevertPatch } from "../lib/wishProgress";
import type {
  Expense,
  ExpenseCategory,
  JournalEntry,
  LogEntry,
  Medication,
  MedicationLog,
  RoutineStepLog,
  RoutineTemplate,
  Task,
  Wish,
} from "../types";
import { BottomSheet } from "./BottomSheet";
import { Chip } from "./Chip";
import { Icon } from "./Icon";
import { badge, errorText, input, mutedText, primaryButton } from "./ui";

export type QuickAddTarget =
  | "task"
  | "journal"
  | "water"
  | "mood"
  | "expense"
  | "medication"
  | "routine"
  | "wish";

const TARGETS: { id: QuickAddTarget; label: string; icon: LucideIcon }[] = [
  { id: "task", label: "Task", icon: CheckSquare },
  { id: "journal", label: "Journal", icon: NotebookPen },
  { id: "water", label: "Water", icon: Droplet },
  { id: "mood", label: "Mood", icon: Smile },
  { id: "expense", label: "Expense", icon: Receipt },
  { id: "medication", label: "Medication", icon: Pill },
  { id: "routine", label: "Routine step", icon: ListChecks },
  { id: "wish", label: "Wish progress", icon: Target },
];

// Default stays "end of day" (23:59, same as before) — these are just a faster way to pick
// a different time than typing into the native time input below, which still works for
// anything more specific.
const TASK_TIME_PRESETS: { label: string; time: string }[] = [
  { label: "Morning", time: "09:00" },
  { label: "Afternoon", time: "14:00" },
  { label: "Evening", time: "18:00" },
  { label: "Night", time: "21:00" },
  { label: "End of day", time: END_OF_DAY_TIME },
];

function defaultDueDate(location: Location): string {
  if (location.pathname === "/dashboard") {
    const param = new URLSearchParams(location.search).get("date");
    if (param && isValidDateStr(param)) return param;
  }
  return todayLocal();
}

const LAST_EXPENSE_CATEGORY_KEY = "lifeos_quickadd_last_expense_category";

function loadLastCategory(): ExpenseCategory {
  try {
    const stored = localStorage.getItem(LAST_EXPENSE_CATEGORY_KEY);
    return (EXPENSE_CATEGORIES as string[]).includes(stored ?? "") ? (stored as ExpenseCategory) : "food";
  } catch {
    return "food";
  }
}

export function QuickAddSheet({
  open,
  onClose,
  initialTarget,
}: {
  open: boolean;
  onClose: () => void;
  initialTarget?: QuickAddTarget;
}) {
  const [target, setTarget] = useState<QuickAddTarget>(initialTarget ?? "task");

  useEffect(() => {
    if (open) setTarget(initialTarget ?? "task");
  }, [open, initialTarget]);

  return (
    <BottomSheet open={open} onClose={onClose} title="Quick add">
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {TARGETS.map((t) => (
          <Chip key={t.id} active={target === t.id} onClick={() => setTarget(t.id)}>
            <Icon icon={t.icon} size={14} />
            {t.label}
          </Chip>
        ))}
      </div>

      {target === "task" && <TaskQuickAdd onDone={onClose} />}
      {target === "journal" && <JournalQuickAdd onDone={onClose} />}
      {target === "water" && <WaterQuickAdd onDone={onClose} />}
      {target === "mood" && <MoodQuickAdd onDone={onClose} />}
      {target === "expense" && <ExpenseQuickAdd onDone={onClose} />}
      {target === "medication" && <MedicationQuickAdd />}
      {target === "routine" && <RoutineQuickAdd />}
      {target === "wish" && <WishQuickAdd />}
    </BottomSheet>
  );
}

// --- Task ------------------------------------------------------------------

function TaskQuickAdd({ onDone }: { onDone: () => void }) {
  const { request } = useApi();
  const { show } = useToast();
  const location = useLocation();
  const [title, setTitle] = useState("");
  // Opening the sheet from Today while viewing another day defaults a new task to that same
  // day, not the real today — the "/dashboard?date=..." the user is already looking at.
  const [dueDate, setDueDate] = useState(() => defaultDueDate(location));
  const [dueTime, setDueTime] = useState(END_OF_DAY_TIME);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const task = await request<Task>("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          dueDate,
          dueTime,
          dueAtUtc: computeDueAtUtc(dueDate, dueTime),
        }),
      });
      show(`Added "${task.title}"`, {
        undo: () => {
          request(`/tasks/${task.taskId}`, { method: "DELETE" }).catch(() => {});
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        placeholder="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        className={input}
      />
      <div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {TASK_TIME_PRESETS.map((preset) => (
            <Chip key={preset.label} active={dueTime === preset.time} onClick={() => setDueTime(preset.time)}>
              {preset.label}
            </Chip>
          ))}
        </div>
        <div className="flex gap-2">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`flex-1 ${input}`} aria-label="Due date" />
          <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className={`flex-1 ${input}`} aria-label="Due time" />
        </div>
      </div>
      {error && <p className={errorText}>{error}</p>}
      <button type="button" disabled={saving || !title.trim()} onClick={handleSave} className={primaryButton}>
        {saving ? "Adding..." : "Add task"}
      </button>
    </div>
  );
}

// --- Journal -----------------------------------------------------------------

function JournalQuickAdd({ onDone }: { onDone: () => void }) {
  const { request } = useApi();
  const { show } = useToast();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedVoice, setUsedVoice] = useState(false);
  const baseTextRef = useRef("");
  const startedRef = useRef(false);

  const { supported, listening, start, stop } = useSpeechToText((transcript) => {
    setText(`${baseTextRef.current}${baseTextRef.current ? " " : ""}${transcript}`);
  });

  useEffect(() => {
    if (supported && !startedRef.current) {
      startedRef.current = true;
      baseTextRef.current = "";
      setUsedVoice(true);
      start();
    }
    return () => {
      if (startedRef.current) stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave() {
    if (!text.trim()) return;
    if (listening) stop();
    setSaving(true);
    setError(null);
    try {
      const date = todayLocal();
      let entry: JournalEntry;
      try {
        entry = await request<JournalEntry>("/journal", {
          method: "POST",
          body: JSON.stringify({ date, text: text.trim(), voiceInput: usedVoice }),
        });
      } catch {
        // An entry for today may already exist (POST only allows one per day) — fall back
        // to PATCH the same way Journal.tsx's own save flow does.
        entry = await request<JournalEntry>(`/journal/${date}`, {
          method: "PATCH",
          body: JSON.stringify({ date, text: text.trim(), voiceInput: usedVoice }),
        });
      }
      show("Journal entry saved");
      void entry;
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save entry");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={supported ? "Listening... or type here" : "Write today's entry..."}
        rows={4}
        autoFocus
        className={`${input} resize-none`}
      />
      {supported && (
        <button
          type="button"
          onClick={() => (listening ? stop() : start())}
          className={`inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1 text-xs font-medium ${
            listening ? "bg-alert text-paper-card" : "border border-stone text-ink-muted dark:border-stone-dark dark:text-mist-muted"
          }`}
        >
          <Icon icon={listening ? Mic : MicOff} size={13} />
          {listening ? "Listening..." : "Resume voice"}
        </button>
      )}
      {error && <p className={errorText}>{error}</p>}
      <button type="button" disabled={saving || !text.trim()} onClick={handleSave} className={primaryButton}>
        {saving ? "Saving..." : "Save entry"}
      </button>
    </div>
  );
}

// --- Water -------------------------------------------------------------------

function WaterQuickAdd({ onDone }: { onDone: () => void }) {
  const { request } = useApi();
  const { show } = useToast();
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addMl(amountMl: number) {
    setPending(amountMl);
    setError(null);
    const date = todayLocal();
    try {
      const { habits } = await request<{ habits: { habitType: string; value: number }[] }>(`/habits/${date}`);
      const current = habits.find((h) => h.habitType === "water")?.value ?? 0;
      const next = current + amountMl;
      await request(`/habits/${date}/water`, { method: "PATCH", body: JSON.stringify({ value: next }) });
      show(`+${amountMl}ml water logged`, {
        undo: () => {
          request(`/habits/${date}/water`, { method: "PATCH", body: JSON.stringify({ value: current }) }).catch(() => {});
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log water");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className={mutedText}>Log water intake for today.</p>
      <div className="flex gap-2">
        {[250, 500, 750].map((amount) => (
          <button
            key={amount}
            type="button"
            disabled={pending !== null}
            onClick={() => addMl(amount)}
            className={`flex-1 rounded-control border border-stone py-3 text-sm font-medium text-ink transition-colors hover:bg-stone/40 disabled:opacity-50 dark:border-stone-dark dark:text-paper dark:hover:bg-stone-dark/40`}
          >
            {pending === amount ? "..." : `+${amount}ml`}
          </button>
        ))}
      </div>
      {error && <p className={errorText}>{error}</p>}
    </div>
  );
}

// --- Mood ----------------------------------------------------------------------

function MoodQuickAdd({ onDone }: { onDone: () => void }) {
  const { request } = useApi();
  const { show } = useToast();
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function selectMood(rating: number) {
    setSaving(rating);
    setError(null);
    const date = todayLocal();
    try {
      const { entries } = await request<{ entries: LogEntry[] }>(`/logs?logType=mood&from=${date}&to=${date}`);
      const existing = entries[0];
      if (existing) {
        await request(`/logs/${existing.logId}`, { method: "PATCH", body: JSON.stringify({ data: { rating } }) });
      } else {
        await request("/logs", { method: "POST", body: JSON.stringify({ logType: "mood", date, data: { rating } }) });
      }
      show(`Mood logged: ${rating}/5`);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log mood");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className={mutedText}>How are you feeling right now?</p>
      <div className="flex justify-between gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={saving !== null}
            onClick={() => selectMood(n)}
            aria-label={`Mood rating ${n}`}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-stone text-sm font-medium text-ink transition-colors hover:bg-stone/40 disabled:opacity-50 dark:border-stone-dark dark:text-paper dark:hover:bg-stone-dark/40"
          >
            {saving === n ? "..." : n}
          </button>
        ))}
      </div>
      {error && <p className={errorText}>{error}</p>}
    </div>
  );
}

// --- Expense ---------------------------------------------------------------

function ExpenseQuickAdd({ onDone }: { onDone: () => void }) {
  const { request } = useApi();
  const { show } = useToast();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>(loadLastCategory());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) {
      setError("Enter a non-negative amount");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const expense = await request<Expense>("/expenses", {
        method: "POST",
        body: JSON.stringify({ date: todayLocal(), category, amount: amt }),
      });
      try {
        localStorage.setItem(LAST_EXPENSE_CATEGORY_KEY, category);
      } catch {
        // best-effort
      }
      show(`Logged ${EXPENSE_CATEGORY_LABEL[category]} expense`, {
        undo: () => {
          request(`/expenses/${expense.expenseId}`, { method: "DELETE" }).catch(() => {});
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log expense");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="number"
        min={0}
        placeholder="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        autoFocus
        className={input}
      />
      <div className="flex flex-wrap gap-1.5">
        {EXPENSE_CATEGORIES.map((c) => (
          <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
            {EXPENSE_CATEGORY_EMOJI[c]} {EXPENSE_CATEGORY_LABEL[c]}
          </Chip>
        ))}
      </div>
      {error && <p className={errorText}>{error}</p>}
      <button type="button" disabled={saving || !amount} onClick={handleSave} className={primaryButton}>
        {saving ? "Logging..." : "Log expense"}
      </button>
    </div>
  );
}

// --- Medication taken --------------------------------------------------------

function MedicationQuickAdd() {
  const { request } = useApi();
  const { show } = useToast();
  const [medications, setMedications] = useState<Medication[] | null>(null);
  const [taken, setTaken] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const date = todayLocal();
    Promise.all([
      request<{ medications: Medication[] }>("/medications"),
      request<{ logs: MedicationLog[] }>(`/medication-logs/${date}`),
    ])
      .then(([medsRes, logsRes]) => {
        if (ignore) return;
        setMedications(medsRes.medications);
        const takenNext: Record<string, boolean> = {};
        for (const log of logsRes.logs) takenNext[log.medicationId] = log.status === "taken";
        setTaken(takenNext);
      })
      .catch(() => {
        if (!ignore) setMedications([]);
      });
    return () => {
      ignore = true;
    };
  }, [request]);

  async function markTaken(medicationId: string, name: string) {
    setPending(medicationId);
    const date = todayLocal();
    const wasTaken = taken[medicationId] ?? false;
    setTaken((prev) => ({ ...prev, [medicationId]: true }));
    try {
      await request(`/medication-logs/${date}/${medicationId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "taken" }),
      });
      show(`${name} marked taken`, {
        undo: () => {
          setTaken((prev) => ({ ...prev, [medicationId]: wasTaken }));
          request(`/medication-logs/${date}/${medicationId}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "missed" }),
          }).catch(() => {});
        },
      });
    } catch {
      setTaken((prev) => ({ ...prev, [medicationId]: wasTaken }));
    } finally {
      setPending(null);
    }
  }

  if (medications === null) return <p className={mutedText}>Loading medications...</p>;
  if (medications.length === 0) return <p className={mutedText}>No medications yet.</p>;

  return (
    <ul className="flex flex-col gap-1">
      {medications.map((m) => (
        <li key={m.medicationId} className="flex min-h-11 items-center justify-between gap-3">
          <span className="text-sm text-ink dark:text-paper">{m.name}</span>
          <button
            type="button"
            disabled={pending === m.medicationId || taken[m.medicationId]}
            onClick={() => markTaken(m.medicationId, m.name)}
            className={`${badge} ${taken[m.medicationId] ? "opacity-60" : ""}`}
          >
            {taken[m.medicationId] ? "Taken" : "Mark taken"}
          </button>
        </li>
      ))}
    </ul>
  );
}

// --- Routine step ------------------------------------------------------------

function RoutineQuickAdd() {
  const { request } = useApi();
  const { show } = useToast();
  const [routines, setRoutines] = useState<RoutineTemplate[] | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const date = todayLocal();
    Promise.all([
      request<{ routines: RoutineTemplate[] }>("/routines"),
      request<{ logs: RoutineStepLog[] }>(`/routine-logs/${date}`),
    ])
      .then(([routinesRes, logsRes]) => {
        if (ignore) return;
        setRoutines(routinesRes.routines);
        const doneNext: Record<string, boolean> = {};
        for (const log of logsRes.logs) doneNext[`${log.routineId}#${log.stepIndex}`] = log.status === "done";
        setDone(doneNext);
      })
      .catch(() => {
        if (!ignore) setRoutines([]);
      });
    return () => {
      ignore = true;
    };
  }, [request]);

  async function markDone(routineId: string, stepIndex: number, stepLabel: string) {
    const key = `${routineId}#${stepIndex}`;
    setPending(key);
    const date = todayLocal();
    const wasDone = done[key] ?? false;
    setDone((prev) => ({ ...prev, [key]: true }));
    try {
      await request(`/routine-logs/${date}/${routineId}/${stepIndex}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "done" }),
      });
      show(`"${stepLabel}" done`, {
        undo: () => {
          setDone((prev) => ({ ...prev, [key]: wasDone }));
          request(`/routine-logs/${date}/${routineId}/${stepIndex}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "skipped" }),
          }).catch(() => {});
        },
      });
    } catch {
      setDone((prev) => ({ ...prev, [key]: wasDone }));
    } finally {
      setPending(null);
    }
  }

  if (routines === null) return <p className={mutedText}>Loading routines...</p>;
  const steps = routines.flatMap((r) => r.steps.map((label, i) => ({ routine: r, label, i })));
  if (steps.length === 0) return <p className={mutedText}>No routine steps yet.</p>;

  return (
    <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
      {steps.map(({ routine, label, i }) => {
        const key = `${routine.routineId}#${i}`;
        return (
          <li key={key} className="flex min-h-11 items-center justify-between gap-3">
            <span className="truncate text-sm text-ink dark:text-paper">
              {label} <span className={mutedText}>({routine.name})</span>
            </span>
            <button
              type="button"
              disabled={pending === key || done[key]}
              onClick={() => markDone(routine.routineId, i, label)}
              className={`${badge} shrink-0 ${done[key] ? "opacity-60" : ""}`}
            >
              {done[key] ? "Done" : "Mark done"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// --- Wish progress -----------------------------------------------------------

function WishQuickAdd() {
  const { request } = useApi();
  const { show } = useToast();
  const [wishes, setWishes] = useState<Wish[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    request<{ wishes: Wish[] }>("/wishes")
      .then((res) => {
        if (ignore) return;
        setWishes(
          res.wishes
            .filter((w) => w.status !== "completed" && w.status !== "abandoned")
            .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
            .slice(0, 5),
        );
      })
      .catch(() => {
        if (!ignore) setWishes([]);
      });
    return () => {
      ignore = true;
    };
  }, [request]);

  async function increment(wish: Wish) {
    const patch = nextWishIncrementPatch(wish);
    if (!patch) return;
    setPending(wish.wishId);
    try {
      const updated = await request<Wish>(`/wishes/${wish.wishId}`, { method: "PATCH", body: JSON.stringify(patch) });
      setWishes((prev) => prev?.map((w) => (w.wishId === wish.wishId ? updated : w)) ?? prev);
      show(`"${wish.title}" progress updated`, {
        undo: () => {
          request(`/wishes/${wish.wishId}`, { method: "PATCH", body: JSON.stringify(wishRevertPatch(wish)) })
            .then((reverted) => setWishes((prev) => prev?.map((w) => (w.wishId === wish.wishId ? (reverted as Wish) : w)) ?? prev))
            .catch(() => {});
        },
      });
    } finally {
      setPending(null);
    }
  }

  if (wishes === null) return <p className={mutedText}>Loading wishes...</p>;
  if (wishes.length === 0) return <p className={mutedText}>No active wishes yet.</p>;

  return (
    <ul className="flex flex-col gap-1">
      {wishes.map((w) => {
        const incrementable = wishIsIncrementable(w);
        return (
          <li key={w.wishId} className="flex min-h-11 items-center justify-between gap-3">
            <span className="truncate text-sm text-ink dark:text-paper">{w.title}</span>
            {incrementable ? (
              <button
                type="button"
                disabled={pending === w.wishId}
                onClick={() => increment(w)}
                aria-label={`Increment progress on ${w.title}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone text-ink-muted transition-colors hover:bg-stone/40 disabled:opacity-50 dark:border-stone-dark dark:text-mist-muted dark:hover:bg-stone-dark/40"
              >
                <Icon icon={Plus} size={14} />
              </button>
            ) : (
              <span className={mutedText}>—</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
