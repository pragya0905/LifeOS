import { useState } from "react";
import { Check, MinusCircle, X } from "lucide-react";
import type { MedicationLogStatus } from "../types";
import { REASON_CHIPS, medicationStatusLabel } from "../lib/statusDisplay";
import { Chip } from "./Chip";
import { Icon } from "./Icon";
import { checkAnimationClass } from "../lib/preferences";
import { input } from "./ui";

// Shared between the Medications page's own "Today" section and the Dashboard Today
// screen's Medications module — three always-visible Taken/Skipped/Missed buttons (never
// behind a menu) plus a visible "+ Add note" that expands an inline reason-chip panel.
// Skipped and its note both go through the same real backend fields the routine steps use
// (status + optional note, additive-only extension of updateMedicationLog).
export function MedicationStatusButtons({
  status,
  note,
  pending,
  onSetStatus,
}: {
  status: MedicationLogStatus | undefined | null;
  note?: string;
  pending: boolean;
  onSetStatus: (status: MedicationLogStatus, note?: string) => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(note ?? "");

  function saveNote() {
    onSetStatus(status === "taken" || !status ? "skipped" : status, noteDraft.trim() || undefined);
    setNoteOpen(false);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        <StatusButton active={status === "taken"} onClick={() => onSetStatus("taken")} disabled={pending} icon={Check} label="Taken" activeClass="border-success bg-success text-paper-card" />
        <StatusButton active={status === "skipped"} onClick={() => onSetStatus("skipped")} disabled={pending} icon={MinusCircle} label="Skipped" activeClass="border-slate bg-slate text-paper-card" />
        <StatusButton active={status === "missed"} onClick={() => onSetStatus("missed")} disabled={pending} icon={X} label="Missed" activeClass="border-alert bg-alert text-paper-card" />
      </div>
      {status && status !== "taken" && !noteOpen && (
        <p className="text-xs text-ink-muted dark:text-mist-muted">{medicationStatusLabel(status, note)}</p>
      )}
      {!noteOpen ? (
        <button
          type="button"
          onClick={() => {
            setNoteDraft(note ?? "");
            setNoteOpen(true);
          }}
          className="inline-flex min-h-8 w-fit items-center rounded-control px-2 text-xs font-medium text-bloom hover:bg-bloom-soft dark:hover:bg-bloom-soft-dark"
        >
          + Add note
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-control border border-stone p-2.5 dark:border-stone-dark">
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
            <button type="button" onClick={saveNote} className="min-h-9 flex-1 rounded-control bg-bloom text-xs font-medium text-paper-card hover:bg-bloom-light">
              Save note
            </button>
            <button type="button" onClick={() => setNoteOpen(false)} className="min-h-9 rounded-control border border-stone px-3 text-xs text-ink-muted dark:border-stone-dark dark:text-mist-muted">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusButton({
  active,
  onClick,
  disabled,
  icon,
  label,
  activeClass,
}: {
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  icon: typeof Check;
  label: string;
  activeClass: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-control border text-xs font-medium transition-colors disabled:opacity-70 ${
        active
          ? `${activeClass} ${checkAnimationClass()}`
          : "border-stone text-ink-muted hover:bg-stone/40 dark:border-stone-dark dark:text-mist-muted dark:hover:bg-stone-dark/40"
      }`}
    >
      <Icon icon={icon} size={13} strokeWidth={2.4} />
      {label}
    </button>
  );
}
