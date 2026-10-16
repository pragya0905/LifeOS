import { Check } from "lucide-react";
import type { Medication, MedicationLogStatus } from "../types";
import { Icon } from "./Icon";
import { MedicationStatusButtons } from "./MedicationStatusButtons";
import { mutedText, sectionLabel } from "./ui";

export interface MedicationRow {
  medication: Medication;
  status: MedicationLogStatus | null; // null = no log yet today
  note?: string;
  pending: boolean;
  /** false on a future date — a planning view only, nothing can be marked yet. */
  editable: boolean;
}

type Bucket = "Morning" | "Afternoon" | "Night" | "Anytime";

function bucketFor(timeOfDay: string | undefined): Bucket {
  if (!timeOfDay) return "Anytime";
  const hour = Number(timeOfDay.slice(0, 2));
  if (Number.isNaN(hour)) return "Anytime";
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Night";
}

const BUCKET_ORDER: Bucket[] = ["Morning", "Afternoon", "Night", "Anytime"];

export function TodayMedicationsSection({
  rows,
  onSetStatus,
  onMarkAllTaken,
}: {
  rows: MedicationRow[];
  onSetStatus: (medicationId: string, status: MedicationLogStatus, note?: string) => Promise<void>;
  onMarkAllTaken: (bucketMedicationIds: string[]) => void;
}) {
  if (rows.length === 0) {
    return <p className={mutedText}>No medications scheduled today.</p>;
  }

  const buckets = BUCKET_ORDER.map((bucket) => ({
    bucket,
    rows: rows
      .filter((r) => bucketFor(r.medication.timeOfDay) === bucket)
      .sort((a, b) => (a.medication.timeOfDay ?? "99:99").localeCompare(b.medication.timeOfDay ?? "99:99")),
  })).filter((b) => b.rows.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {buckets.map(({ bucket, rows: bucketRows }) => {
        // Only "taken" is a resolved, collapsible state — same rule as routines' done/N-A
        // vs skipped: a skipped medication stays visible so its reason stays reachable.
        const allTaken = bucketRows.every((r) => r.status === "taken");
        const bucketEditable = bucketRows.every((r) => r.editable);
        const pendingIds = bucketRows.filter((r) => r.status === null).map((r) => r.medication.medicationId);
        return (
          <div key={bucket}>
            <p className={`mb-1.5 ${sectionLabel}`}>{bucket}</p>
            {allTaken ? (
              <div className="flex min-h-11 items-center gap-2 rounded-control border border-success bg-success-soft px-3 text-sm font-medium text-success-ink dark:bg-success-soft-dark dark:text-success-ink-dark">
                <Icon icon={Check} size={15} strokeWidth={2.4} />
                All taken
              </div>
            ) : (
              <>
                <ul className="flex flex-col gap-2.5">
                  {bucketRows.map((r) => (
                    <MedicationRowItem key={r.medication.medicationId} row={r} onSetStatus={onSetStatus} />
                  ))}
                </ul>
                {pendingIds.length > 0 && bucketEditable && (
                  <button
                    type="button"
                    onClick={() => onMarkAllTaken(pendingIds)}
                    className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-control border border-success px-3 text-xs font-medium text-success-ink hover:bg-success-soft dark:text-success-ink-dark dark:hover:bg-success-soft-dark"
                  >
                    <Icon icon={Check} size={13} />
                    Mark all taken
                  </button>
                )}
                {pendingIds.length > 0 && !bucketEditable && (
                  <p className="mt-2 text-xs text-ink-muted dark:text-mist-muted">Can't mark future items</p>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MedicationRowItem({
  row,
  onSetStatus,
}: {
  row: MedicationRow;
  onSetStatus: (medicationId: string, status: MedicationLogStatus, note?: string) => Promise<void>;
}) {
  const { medication, status, note, pending, editable } = row;
  const instructions = [medication.dosage, medication.notes].filter(Boolean).join(" · ");

  return (
    <li className="rounded-control border border-stone p-2.5 dark:border-stone-dark">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink dark:text-paper">{medication.name}</span>
        {medication.timeOfDay && <span className="shrink-0 text-xs tabular-nums text-ink-muted dark:text-mist-muted">{medication.timeOfDay}</span>}
      </div>
      {instructions && <p className="mb-2 text-xs text-ink-muted dark:text-mist-muted">{instructions}</p>}
      <MedicationStatusButtons
        status={status}
        note={note}
        pending={pending || !editable}
        showAddNote={editable}
        onSetStatus={(next, nextNote) => void onSetStatus(medication.medicationId, next, nextNote)}
      />
    </li>
  );
}
