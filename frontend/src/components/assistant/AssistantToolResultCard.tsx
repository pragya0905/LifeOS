import {
  CheckSquare,
  ListChecks,
  Pill,
  Receipt,
  ScrollText,
  Sparkles,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { AssistantToolResultSummary } from "../../hooks/useAssistantStream";
import { Icon } from "../Icon";

// A minimal rendering of B1's result summary — the reserved layout slot Part 3 will finish
// (icon-per-type polish, Undo, a View link, and the never-show-on-failure guarantee, which
// already holds structurally: this only ever renders from a `result` field that a failed tool
// call never carries). For now it's read-only: the data, plainly laid out.
const ITEM_ICONS: Record<string, LucideIcon> = {
  task: CheckSquare,
  medication: Pill,
  medicationLog: Pill,
  routine: ListChecks,
  routineStep: ListChecks,
  wish: Target,
  expense: Receipt,
  budget: Wallet,
  log: ScrollText,
  habit: ScrollText,
  journal: ScrollText,
  mealPlanSlot: ScrollText,
  mealPlanTemplate: ScrollText,
  mealPlanBatch: ScrollText,
  goal: Target,
};

export function AssistantToolResultCard({ result }: { result: AssistantToolResultSummary }) {
  const icon = ITEM_ICONS[result.itemType] ?? Sparkles;
  const fieldEntries = Object.entries(result.fields ?? {});

  return (
    <div className="mt-2 flex items-start gap-2.5 rounded-control border border-stone bg-paper-card px-3 py-2.5 dark:border-stone-dark dark:bg-ink-bg-card">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bloom-soft text-bloom dark:bg-bloom-soft-dark dark:text-bloom-light">
        <Icon icon={icon} size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink dark:text-paper">
          {result.deleted ? `${result.title} removed` : result.title}
        </p>
        {fieldEntries.length > 0 && (
          <dl className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {fieldEntries.map(([key, value]) => (
              <div key={key} className="flex gap-1 text-xs text-ink-muted dark:text-mist-muted">
                <dt className="capitalize">{key}:</dt>
                <dd className="break-words">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
