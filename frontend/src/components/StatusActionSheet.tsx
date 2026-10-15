import { useEffect, useState } from "react";
import type { MedicationLogStatus, RoutineStepStatus } from "../types";
import { REASON_CHIPS } from "../lib/statusDisplay";
import { BottomSheet } from "./BottomSheet";
import { Chip } from "./Chip";
import { errorText, input, pillButton, pillButtonDone, pillButtonInactive, pillButtonMissed, pillButtonNotApplicable, pillButtonSkipped, primaryButton } from "./ui";

interface RoutineAction {
  kind: "routine";
  currentStatus: RoutineStepStatus;
  currentNote?: string;
  onSave: (status: RoutineStepStatus, note?: string) => Promise<void>;
}

interface MedicationAction {
  kind: "medication";
  currentStatus: MedicationLogStatus;
  onSave: (status: MedicationLogStatus) => Promise<void>;
}

// Shared sheet for the "..." menu on a routine-step or medication row. The status set and
// whether a note/reason is offered at all are deliberately different per kind — the backend
// only accepts done/skipped/not_applicable + an optional note for routine steps, and only
// taken/missed with no note field at all for medications (confirmed by reading
// updateRoutineStepLog/updateMedicationLog directly) — this never offers more than the API
// actually supports.
export function StatusActionSheet({
  open,
  onClose,
  title,
  action,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  action: RoutineAction | MedicationAction;
}) {
  const [status, setStatus] = useState<string>(action.currentStatus);
  const [note, setNote] = useState(action.kind === "routine" ? action.currentNote ?? "" : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStatus(action.currentStatus);
    setNote(action.kind === "routine" ? action.currentNote ?? "" : "");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (action.kind === "routine") {
        await action.onSave(status as RoutineStepStatus, status === "done" ? undefined : note.trim() || undefined);
      } else {
        await action.onSave(status as MedicationLogStatus);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setSaving(false);
    }
  }

  const needsNote = action.kind === "routine" && status !== "done";

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-3">
        {action.kind === "routine" ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => setStatus("done")} className={`${pillButton} flex-1 py-2 ${status === "done" ? pillButtonDone : pillButtonInactive}`}>
              Done
            </button>
            <button type="button" onClick={() => setStatus("skipped")} className={`${pillButton} flex-1 py-2 ${status === "skipped" ? pillButtonSkipped : pillButtonInactive}`}>
              Skipped
            </button>
            <button type="button" onClick={() => setStatus("not_applicable")} className={`${pillButton} flex-1 py-2 ${status === "not_applicable" ? pillButtonNotApplicable : pillButtonInactive}`}>
              N/A
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={() => setStatus("taken")} className={`${pillButton} flex-1 py-2 ${status === "taken" ? pillButtonDone : pillButtonInactive}`}>
              Taken
            </button>
            <button type="button" onClick={() => setStatus("missed")} className={`${pillButton} flex-1 py-2 ${status === "missed" ? pillButtonMissed : pillButtonInactive}`}>
              Missed
            </button>
          </div>
        )}

        {needsNote && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {REASON_CHIPS.map((reason) => (
                <Chip key={reason} active={note === reason} onClick={() => setNote(reason === "Other" ? "" : reason)}>
                  {reason}
                </Chip>
              ))}
            </div>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a reason (optional)"
              maxLength={200}
              className={input}
            />
          </>
        )}

        {error && <p className={errorText}>{error}</p>}
        <button type="button" disabled={saving} onClick={handleSave} className={primaryButton}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </BottomSheet>
  );
}
