import { Check, X } from "lucide-react";
import type { Medication, MedicationLogStatus } from "../types";
import { checkAnimationClass } from "../lib/preferences";
import { Icon } from "./Icon";
import { mutedText, sectionLabel } from "./ui";

export interface MedicationRow {
  medication: Medication;
  status: MedicationLogStatus | null; // null = no log yet today
  pending: boolean;
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

const ACTIVE_CLASS: Record<MedicationLogStatus, string> = {
  taken: "border-success bg-success text-paper-card",
  missed: "border-alert bg-alert text-paper-card",
};
const INACTIVE_CLASS =
  "border-stone text-ink-muted hover:bg-stone/40 dark:border-stone-dark dark:text-mist-muted dark:hover:bg-stone-dark/40";

export function TodayMedicationsSection({
  rows,
  onSetStatus,
  onMarkAllTaken,
}: {
  rows: MedicationRow[];
  onSetStatus: (medicationId: string, status: MedicationLogStatus) => Promise<void>;
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
        const allTaken = bucketRows.every((r) => r.status === "taken");
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
                {pendingIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onMarkAllTaken(pendingIds)}
                    className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-control border border-success px-3 text-xs font-medium text-success-ink hover:bg-success-soft dark:text-success-ink-dark dark:hover:bg-success-soft-dark"
                  >
                    <Icon icon={Check} size={13} />
                    Mark all taken
                  </button>
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
  onSetStatus: (medicationId: string, status: MedicationLogStatus) => Promise<void>;
}) {
  const { medication, status, pending } = row;
  const instructions = [medication.dosage, medication.notes].filter(Boolean).join(" · ");

  return (
    <li className="rounded-control border border-stone p-2.5 dark:border-stone-dark">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink dark:text-paper">{medication.name}</span>
        {medication.timeOfDay && <span className="shrink-0 text-xs tabular-nums text-ink-muted dark:text-mist-muted">{medication.timeOfDay}</span>}
      </div>
      {instructions && <p className="mb-2 text-xs text-ink-muted dark:text-mist-muted">{instructions}</p>}
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => void onSetStatus(medication.medicationId, "taken")}
          aria-pressed={status === "taken"}
          className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-control border text-xs font-medium transition-colors disabled:opacity-70 ${
            status === "taken" ? `${ACTIVE_CLASS.taken} ${checkAnimationClass()}` : INACTIVE_CLASS
          }`}
        >
          <Icon icon={Check} size={13} strokeWidth={2.4} />
          Taken
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void onSetStatus(medication.medicationId, "missed")}
          aria-pressed={status === "missed"}
          className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-control border text-xs font-medium transition-colors disabled:opacity-70 ${
            status === "missed" ? ACTIVE_CLASS.missed : INACTIVE_CLASS
          }`}
        >
          <Icon icon={X} size={13} strokeWidth={2.4} />
          Missed
        </button>
      </div>
    </li>
  );
}
