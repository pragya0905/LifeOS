import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  CheckSquare,
  Droplet,
  HelpCircle,
  ListChecks,
  MessageCircle,
  Moon,
  NotebookPen,
  Pill,
  Receipt,
  ScrollText,
  Settings as SettingsIcon,
  Smile,
  Target,
  TrendingUp,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type { QuickAddTarget } from "./QuickAddSheet";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
}

// A local, dependency-free command palette — fuzzy-ish substring match over a static
// action list, no cmdk/kbar. Shares the exact same quick-add targets as the mobile FAB
// sheet (via onQuickAdd) rather than reimplementing any of that logic here.
export function CommandPalette({
  open,
  onClose,
  onQuickAdd,
  hideCycle = false,
}: {
  open: boolean;
  onClose: () => void;
  onQuickAdd: (target: QuickAddTarget) => void;
  /** Mirrors Layout's own Cycle-visibility rule, so Cmd+K never offers a page the
   *  sidebar/More sheet deliberately hides for this user. */
  hideCycle?: boolean;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = useMemo(
    () => [
      { id: "nav-today", label: "Go to Today", icon: CalendarDays, run: () => navigate("/dashboard") },
      { id: "nav-tasks", label: "Go to Tasks", icon: CheckSquare, run: () => navigate("/tasks") },
      { id: "nav-routines", label: "Go to Routines", icon: ListChecks, run: () => navigate("/routines") },
      { id: "nav-assistant", label: "Go to Assistant", icon: MessageCircle, run: () => navigate("/assistant") },
      { id: "nav-journal", label: "Go to Journal", icon: NotebookPen, run: () => navigate("/journal") },
      { id: "nav-wishes", label: "Go to Wishes", icon: Target, run: () => navigate("/wishes") },
      { id: "nav-calendar", label: "Go to Calendar", icon: CalendarDays, run: () => navigate("/calendar") },
      { id: "nav-medications", label: "Go to Medications", icon: Pill, run: () => navigate("/medications") },
      { id: "nav-meal-plan", label: "Go to Meal Plan", icon: UtensilsCrossed, run: () => navigate("/meal-plan") },
      { id: "nav-budget", label: "Go to Budget", icon: Receipt, run: () => navigate("/budget") },
      ...(hideCycle ? [] : [{ id: "nav-cycle", label: "Go to Cycle", icon: Moon, run: () => navigate("/cycle") }]),
      { id: "nav-logs", label: "Go to Logs", icon: ScrollText, run: () => navigate("/logs") },
      { id: "nav-insights", label: "Go to Insights", icon: TrendingUp, run: () => navigate("/insights") },
      { id: "nav-settings", label: "Go to Settings", icon: SettingsIcon, run: () => navigate("/settings") },
      { id: "nav-help", label: "Go to Help", icon: HelpCircle, run: () => navigate("/help") },
      { id: "qa-task", label: "Quick add: Task", hint: "Due today by default", icon: CheckSquare, run: () => onQuickAdd("task") },
      { id: "qa-journal", label: "Quick add: Journal entry", icon: NotebookPen, run: () => onQuickAdd("journal") },
      { id: "qa-water", label: "Quick add: Water", icon: Droplet, run: () => onQuickAdd("water") },
      { id: "qa-mood", label: "Quick add: Mood", icon: Smile, run: () => onQuickAdd("mood") },
      { id: "qa-expense", label: "Quick add: Expense", icon: Receipt, run: () => onQuickAdd("expense") },
      { id: "qa-medication", label: "Quick add: Medication taken", icon: Pill, run: () => onQuickAdd("medication") },
      { id: "qa-routine", label: "Quick add: Routine step", icon: ListChecks, run: () => onQuickAdd("routine") },
      { id: "qa-wish", label: "Quick add: Wish progress", icon: Target, run: () => onQuickAdd("wish") },
    ],
    [navigate, onQuickAdd, hideCycle],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      // Let the dialog mount before focusing, so the input actually exists.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  if (!open) return null;

  function runAt(index: number) {
    const command = filtered[index];
    if (!command) return;
    command.run();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40 backdrop-blur-sm dark:bg-ink-bg/70" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="animate-pop relative w-full max-w-md overflow-hidden rounded-card border border-stone bg-paper-card shadow-raised dark:border-stone-dark dark:bg-ink-bg-card dark:shadow-raised-dark"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelected((i) => Math.min(i + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelected((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            runAt(selected);
          } else if (e.key === "Escape") {
            onClose();
          }
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search actions or pages..."
          className="w-full border-b border-stone bg-transparent px-4 py-3.5 text-sm text-ink outline-none dark:border-stone-dark dark:text-paper"
        />
        <ul className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-muted dark:text-mist-muted">No matches</li>}
          {filtered.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseEnter={() => setSelected(i)}
                onClick={() => runAt(i)}
                className={`flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left text-sm ${
                  i === selected ? "bg-bloom-soft text-bloom dark:bg-bloom-soft-dark dark:text-bloom-light" : "text-ink dark:text-paper"
                }`}
              >
                <c.icon size={16} />
                <span className="flex-1">{c.label}</span>
                {c.hint && <span className="text-xs text-ink-muted dark:text-mist-muted">{c.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
