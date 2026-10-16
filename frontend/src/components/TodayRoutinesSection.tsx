import { useState } from "react";
import { Check, ChevronDown, ChevronRight, MinusCircle, SkipForward, Target, X } from "lucide-react";
import type { RoutineStepStatus, RoutineTemplate } from "../types";
import { REASON_CHIPS, routineStatusLabel } from "../lib/statusDisplay";
import { checkAnimationClass } from "../lib/preferences";
import { Chip } from "./Chip";
import { Icon } from "./Icon";
import { mutedText, input } from "./ui";

export interface RoutineStepRow {
  index: number;
  label: string;
  /** null = no log yet today — a genuinely neutral "not started" state, distinct from Skipped. */
  status: RoutineStepStatus | null;
  note?: string;
  pending: boolean;
}

export interface RoutineGroup {
  routine: RoutineTemplate;
  steps: RoutineStepRow[];
  expanded: boolean;
  /** false on a future date — a planning view only, nothing can be marked yet. */
  editable: boolean;
  onToggleExpand: () => void;
  onSetStatus: (stepIndex: number, status: RoutineStepStatus, note?: string) => Promise<void>;
  onMarkAllDone: () => void;
  onSkipRemaining: () => void;
}

// done=success green, skipped=calm muted gray, not_applicable=neutral blue-gray (never
// amber/orange — that reads as a warning, which "doesn't apply today" isn't).
const STATUS_BUTTON_CLASS: Record<RoutineStepStatus, string> = {
  done: "border-success bg-success text-paper-card",
  skipped: "border-mist-muted bg-mist-muted text-paper-card",
  not_applicable: "border-slate bg-slate text-paper-card",
};

const INACTIVE_BUTTON_CLASS =
  "border-stone text-ink-muted hover:bg-stone/40 dark:border-stone-dark dark:text-mist-muted dark:hover:bg-stone-dark/40";

// Counts toward the x/y progress badge and the streak — skipped does not (unchanged).
function isCounted(status: RoutineStepStatus | null): boolean {
  return status === "done" || status === "not_applicable";
}

// Nothing left to decide today — done, skipped, AND not_applicable all "resolve" a step for
// collapse purposes, even though only done/not_applicable count toward progress. A routine
// with a skipped step still collapses (nothing pending), just not with the "all done" line.
export function isRoutineResolved(steps: RoutineStepRow[]): boolean {
  return steps.length > 0 && steps.every((s) => s.status !== null);
}

export function TodayRoutinesSection({
  groups,
  onExpandAll,
  onCollapseCompleted,
  onJumpToNext,
  hasNextRoutine,
}: {
  groups: RoutineGroup[];
  onExpandAll: () => void;
  onCollapseCompleted: () => void;
  onJumpToNext: () => void;
  hasNextRoutine: boolean;
}) {
  if (groups.length === 0) {
    return <p className={mutedText}>No routines scheduled today.</p>;
  }

  const allExpanded = groups.every((g) => g.expanded);

  return (
    <div className="flex flex-col gap-2">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={allExpanded ? onCollapseCompleted : onExpandAll}
          className="inline-flex min-h-9 items-center rounded-control border border-stone px-2.5 text-xs font-medium text-ink-muted hover:bg-stone/40 dark:border-stone-dark dark:text-mist-muted dark:hover:bg-stone-dark/40"
        >
          {allExpanded ? "Collapse completed" : "Expand all"}
        </button>
        {hasNextRoutine && (
          <button
            type="button"
            onClick={onJumpToNext}
            className="inline-flex min-h-9 items-center gap-1 rounded-control border border-stone px-2.5 text-xs font-medium text-ink-muted hover:bg-stone/40 dark:border-stone-dark dark:text-mist-muted dark:hover:bg-stone-dark/40"
          >
            <Icon icon={Target} size={12} />
            Jump to now
          </button>
        )}
      </div>
      {groups.map((g) => (
        <RoutineRow key={g.routine.routineId} group={g} />
      ))}
    </div>
  );
}

function RoutineRow({ group }: { group: RoutineGroup }) {
  const { routine, steps, expanded, editable, onToggleExpand, onSetStatus, onMarkAllDone, onSkipRemaining } = group;
  const doneCount = steps.filter((s) => isCounted(s.status)).length;
  const allDone = doneCount === steps.length && steps.length > 0;
  const resolved = isRoutineResolved(steps);

  if (resolved && !expanded) {
    const skippedCount = steps.filter((s) => s.status === "skipped").length;
    return (
      <button
        type="button"
        id={`routine-${routine.routineId}`}
        onClick={onToggleExpand}
        className={`flex min-h-12 w-full items-center gap-2 rounded-control border px-3 py-2.5 text-left ${
          allDone
            ? "border-success bg-success-soft dark:bg-success-soft-dark"
            : "border-stone bg-stone/20 dark:border-stone-dark dark:bg-stone-dark/20"
        }`}
      >
        <Icon
          icon={Check}
          size={16}
          strokeWidth={2.4}
          className={allDone ? "text-success-ink dark:text-success-ink-dark" : "text-ink-muted dark:text-mist-muted"}
        />
        <span className={`flex-1 text-sm font-medium ${allDone ? "text-success-ink dark:text-success-ink-dark" : "text-ink dark:text-paper"}`}>
          {routine.name} — {allDone ? "all done" : `${doneCount}/${steps.length} done${skippedCount > 0 ? `, ${skippedCount} skipped` : ""}`}
        </span>
        <Icon icon={ChevronRight} size={14} className={allDone ? "text-success-ink dark:text-success-ink-dark" : "text-ink-muted dark:text-mist-muted"} />
      </button>
    );
  }

  return (
    <div id={`routine-${routine.routineId}`} className="scroll-mt-24 rounded-control border border-stone dark:border-stone-dark">
      <button
        type="button"
        onClick={onToggleExpand}
        className="sticky top-14 z-10 flex min-h-12 w-full items-center gap-2 rounded-t-control bg-paper-card px-3 py-2.5 text-left dark:bg-ink-bg-card"
      >
        <Icon icon={expanded ? ChevronDown : ChevronRight} size={16} className="shrink-0 text-ink-muted dark:text-mist-muted" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink dark:text-paper">{routine.name}</span>
        {routine.timeOfDay && <span className="shrink-0 text-xs tabular-nums text-ink-muted dark:text-mist-muted">{routine.timeOfDay}</span>}
        <span className="shrink-0 rounded-full bg-routine-soft px-2 py-0.5 text-xs font-medium tabular-nums text-routine">
          {doneCount}/{steps.length}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-stone px-3 py-2 dark:border-stone-dark">
          <ExpandedSteps steps={steps} editable={editable} onSetStatus={onSetStatus} />
          {editable ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onMarkAllDone}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-control border border-success px-3 text-xs font-medium text-success-ink hover:bg-success-soft dark:border-success dark:text-success-ink-dark dark:hover:bg-success-soft-dark"
              >
                <Icon icon={Check} size={13} />
                Mark all done
              </button>
              <button
                type="button"
                onClick={onSkipRemaining}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-control border border-stone px-3 text-xs font-medium text-ink-muted hover:bg-stone/40 dark:border-stone-dark dark:text-mist-muted dark:hover:bg-stone-dark/40"
              >
                <Icon icon={SkipForward} size={13} />
                Skip all remaining
              </button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-ink-muted dark:text-mist-muted">Can't mark future items</p>
          )}
        </div>
      )}
    </div>
  );
}

function ExpandedSteps({
  steps,
  editable,
  onSetStatus,
  className = "",
}: {
  steps: RoutineStepRow[];
  editable: boolean;
  onSetStatus: (stepIndex: number, status: RoutineStepStatus, note?: string) => Promise<void>;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {steps.map((step) => (
        <StepRow key={step.index} step={step} editable={editable} onSetStatus={onSetStatus} />
      ))}
    </div>
  );
}

function StepRow({
  step,
  editable,
  onSetStatus,
}: {
  step: RoutineStepRow;
  editable: boolean;
  onSetStatus: (stepIndex: number, status: RoutineStepStatus, note?: string) => Promise<void>;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(step.note ?? "");

  function saveNote(status: RoutineStepStatus) {
    void onSetStatus(step.index, status, noteDraft.trim() || undefined);
    setNoteOpen(false);
  }

  return (
    <div className="text-left">
      <p className="text-sm text-ink dark:text-paper">{step.label}</p>
      <div className="mt-1.5 flex gap-1.5">
        {(["done", "skipped", "not_applicable"] as RoutineStepStatus[]).map((candidate) => {
          const active = step.status === candidate;
          return (
            <button
              key={candidate}
              type="button"
              disabled={step.pending || !editable}
              onClick={() => void onSetStatus(step.index, candidate)}
              aria-pressed={active}
              className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-control border text-xs font-medium transition-colors disabled:opacity-70 ${
                active ? `${STATUS_BUTTON_CLASS[candidate]} ${checkAnimationClass()}` : INACTIVE_BUTTON_CLASS
              }`}
            >
              <Icon icon={candidate === "done" ? Check : candidate === "skipped" ? X : MinusCircle} size={13} strokeWidth={2.4} />
              {candidate === "done" ? "Done" : candidate === "skipped" ? "Skipped" : "N/A"}
            </button>
          );
        })}
      </div>
      {step.status && step.status !== "done" && !noteOpen && (
        <p className="mt-1 text-xs text-ink-muted dark:text-mist-muted">{routineStatusLabel(step.status, step.note)}</p>
      )}
      {!editable ? null : !noteOpen ? (
        <button
          type="button"
          onClick={() => {
            setNoteDraft(step.note ?? "");
            setNoteOpen(true);
          }}
          className="mt-1.5 inline-flex min-h-8 items-center rounded-control px-2 text-xs font-medium text-bloom hover:bg-bloom-soft dark:hover:bg-bloom-soft-dark"
        >
          + Add note
        </button>
      ) : (
        <div className="mt-2 flex flex-col gap-2 rounded-control border border-stone p-2.5 dark:border-stone-dark">
          <div className="flex flex-wrap gap-1.5">
            {REASON_CHIPS.map((reason) => (
              <Chip key={reason} active={noteDraft === reason} onClick={() => setNoteDraft(reason === "Other" ? "" : reason)}>
                {reason}
              </Chip>
            ))}
          </div>
          <input
            type="text"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Reason (optional)"
            maxLength={200}
            className={`${input} text-xs`}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => saveNote(step.status === "done" || !step.status ? "skipped" : step.status)}
              className="min-h-9 flex-1 rounded-control bg-bloom text-xs font-medium text-paper-card hover:bg-bloom-light"
            >
              Save note
            </button>
            <button
              type="button"
              onClick={() => setNoteOpen(false)}
              className="min-h-9 rounded-control border border-stone px-3 text-xs text-ink-muted dark:border-stone-dark dark:text-mist-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
