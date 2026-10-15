import { useState } from "react";
import { Check, ChevronDown, ChevronRight, MinusCircle, SkipForward, X } from "lucide-react";
import type { RoutineStepStatus, RoutineTemplate } from "../types";
import { REASON_CHIPS, routineStatusLabel } from "../lib/statusDisplay";
import { checkAnimationClass } from "../lib/preferences";
import { Chip } from "./Chip";
import { Icon } from "./Icon";
import { input, mutedText } from "./ui";

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
  initiallyExpanded: boolean;
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

function isCounted(status: RoutineStepStatus | null): boolean {
  return status === "done" || status === "not_applicable";
}

export function TodayRoutinesSection({ groups }: { groups: RoutineGroup[] }) {
  if (groups.length === 0) {
    return <p className={mutedText}>No routines scheduled today.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {groups.map((g) => (
        <RoutineRow key={g.routine.routineId} group={g} />
      ))}
    </div>
  );
}

function RoutineRow({ group }: { group: RoutineGroup }) {
  const { routine, steps, initiallyExpanded, onSetStatus, onMarkAllDone, onSkipRemaining } = group;
  const doneCount = steps.filter((s) => isCounted(s.status)).length;
  const allDone = doneCount === steps.length && steps.length > 0;
  const [expanded, setExpanded] = useState(initiallyExpanded && !allDone);

  if (allDone) {
    return (
      <div className="rounded-control border border-success bg-success-soft dark:bg-success-soft-dark">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-h-12 w-full items-center gap-2 px-3 py-2.5 text-left"
        >
          <Icon icon={Check} size={16} strokeWidth={2.4} className="shrink-0 text-success-ink dark:text-success-ink-dark" />
          <span className="flex-1 text-sm font-medium text-success-ink dark:text-success-ink-dark">{routine.name} — all done</span>
          <Icon icon={expanded ? ChevronDown : ChevronRight} size={14} className="text-success-ink dark:text-success-ink-dark" />
        </button>
        {expanded && <ExpandedSteps steps={steps} onSetStatus={onSetStatus} className="px-3 pb-3" />}
      </div>
    );
  }

  return (
    <div className="rounded-control border border-stone dark:border-stone-dark">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex min-h-12 w-full items-center gap-2 px-3 py-2.5 text-left"
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
          <ExpandedSteps steps={steps} onSetStatus={onSetStatus} />
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
        </div>
      )}
    </div>
  );
}

function ExpandedSteps({
  steps,
  onSetStatus,
  className = "",
}: {
  steps: RoutineStepRow[];
  onSetStatus: (stepIndex: number, status: RoutineStepStatus, note?: string) => Promise<void>;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {steps.map((step) => (
        <StepRow key={step.index} step={step} onSetStatus={onSetStatus} />
      ))}
    </div>
  );
}

function StepRow({
  step,
  onSetStatus,
}: {
  step: RoutineStepRow;
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
              disabled={step.pending}
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
      {!noteOpen ? (
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
