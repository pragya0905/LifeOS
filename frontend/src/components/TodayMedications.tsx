import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Timer } from "lucide-react";
import { useApi } from "../api/useApi";
import { appliesOnDate } from "../lib/weekdays";
import type { Medication, MedicationLog, MedicationLogStatus } from "../types";
import { EmptyState } from "./EmptyState";
import { Icon } from "./Icon";
import { Skeleton } from "./Skeleton";
import {
  card,
  errorText,
  mutedText,
  pillButton,
  pillButtonDone,
  pillButtonInactive,
  pillButtonMissed,
  sectionLabel,
} from "./ui";

export default function TodayMedications({ date }: { date: string }) {
  const { request } = useApi();
  const [medications, setMedications] = useState<Medication[] | null>(null);
  const [logStatuses, setLogStatuses] = useState<Partial<Record<string, MedicationLogStatus>>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const [medsData, logsData] = await Promise.all([
          request<{ medications: Medication[] }>("/medications"),
          request<{ logs: MedicationLog[] }>(`/medication-logs/${date}`),
        ]);
        if (ignore) return;
        setMedications(medsData.medications);
        const next: Partial<Record<string, MedicationLogStatus>> = {};
        for (const log of logsData.logs) next[log.medicationId] = log.status;
        setLogStatuses(next);
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : "Failed to load medications");
      }
    }
    load();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function setStatus(medicationId: string, status: MedicationLogStatus) {
    setPending(medicationId);
    setError(null);
    try {
      const updated = await request<MedicationLog>(`/medication-logs/${date}/${medicationId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setLogStatuses((prev) => ({ ...prev, [medicationId]: updated.status }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update medication log");
    } finally {
      setPending(null);
    }
  }

  // Medications with no reminder time sort to the end, after every timed one in ascending
  // order — "HH:MM" strings already sort correctly lexicographically, no parsing needed.
  const activeMedications =
    medications
      ?.filter((m) => date >= m.startDate && date <= m.endDate && appliesOnDate(m.daysOfWeek, new Date(`${date}T00:00:00`)))
      .sort((a, b) => {
        if (!a.timeOfDay && !b.timeOfDay) return 0;
        if (!a.timeOfDay) return 1;
        if (!b.timeOfDay) return -1;
        return a.timeOfDay.localeCompare(b.timeOfDay);
      }) ?? null;

  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className={sectionLabel}>💊 Today's medications</h2>
        <Link to="/medications" className="text-xs text-bloom hover:underline">
          Manage →
        </Link>
      </div>
      {error && <p className={`mb-2 ${errorText}`}>{error}</p>}
      {!error && !activeMedications && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-8 w-full" />
        </div>
      )}
      {activeMedications && activeMedications.length === 0 && (
        <EmptyState
          icon="💊"
          title="No active medications"
          hint="Add one on the Medications page to track it here."
        />
      )}
      {activeMedications && activeMedications.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {activeMedications.map((medication) => {
            const status = logStatuses[medication.medicationId];
            return (
              <li
                key={medication.medicationId}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <span className="text-sm text-ink dark:text-paper">
                  {medication.name}
                  {medication.dosage && <span className={`ml-1.5 ${mutedText}`}>{medication.dosage}</span>}
                  {medication.timeOfDay && (
                    <span className={`ml-1.5 inline-flex items-center gap-1 ${mutedText}`}>
                      <Icon icon={Bell} size={12} /> {medication.timeOfDay}
                    </span>
                  )}
                  {medication.estimatedMinutes !== undefined && (
                    <span className={`ml-1.5 inline-flex items-center gap-1 ${mutedText}`}>
                      <Icon icon={Timer} size={12} />~{medication.estimatedMinutes} min
                    </span>
                  )}
                  {medication.notes && (
                    <span className="block text-xs italic text-ink-muted dark:text-mist-muted">
                      {medication.notes}
                    </span>
                  )}
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={pending === medication.medicationId}
                    onClick={() => setStatus(medication.medicationId, "taken")}
                    className={`${pillButton} px-2.5 py-0.5 ${
                      status === "taken" ? pillButtonDone : pillButtonInactive
                    }`}
                  >
                    Taken
                  </button>
                  <button
                    type="button"
                    disabled={pending === medication.medicationId}
                    onClick={() => setStatus(medication.medicationId, "missed")}
                    className={`${pillButton} px-2.5 py-0.5 ${
                      status === "missed" ? pillButtonMissed : pillButtonInactive
                    }`}
                  >
                    Missed
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
