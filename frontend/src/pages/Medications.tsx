import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../api/useApi";
import { todayLocal, toLocalDateStr } from "../lib/date";
import type { Medication, MedicationLog, MedicationLogStatus } from "../types";
import {
  card,
  errorText,
  input,
  label,
  mutedText,
  page,
  pageTitle,
  pillButton,
  pillButtonDone,
  pillButtonInactive,
  pillButtonMissed,
  primaryButton,
  secondaryButton,
  sectionLabel,
} from "../components/ui";

function today(): string {
  return todayLocal();
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toLocalDateStr(d);
}

const DURATION_PRESETS = [7, 30];
const ADHERENCE_WINDOW_DAYS = 14;

// % of active days (within the last 14 days, clamped to the medication's own start/end)
// logged as "taken". Days with no log at all count against adherence, same as "missed".
function computeAdherence(
  medication: Medication,
  logs: MedicationLog[],
  windowStart: string,
  windowEnd: string,
): number | null {
  const activeStart = medication.startDate > windowStart ? medication.startDate : windowStart;
  const activeEnd = medication.endDate < windowEnd ? medication.endDate : windowEnd;
  if (activeStart > activeEnd) return null;

  const takenDates = new Set(
    logs
      .filter((l) => l.medicationId === medication.medicationId && l.status === "taken")
      .map((l) => l.date),
  );

  let activeDays = 0;
  let takenDays = 0;
  const cursor = new Date(`${activeStart}T00:00:00Z`);
  const end = new Date(`${activeEnd}T00:00:00Z`);
  while (cursor <= end) {
    const d = cursor.toISOString().slice(0, 10);
    activeDays += 1;
    if (takenDates.has(d)) takenDays += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return activeDays > 0 ? Math.round((takenDays / activeDays) * 100) : null;
}

export default function Medications() {
  const { request } = useApi();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [logStatuses, setLogStatuses] = useState<Partial<Record<string, MedicationLogStatus>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [durationDays, setDurationDays] = useState(7);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [recentLogs, setRecentLogs] = useState<MedicationLog[]>([]);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const windowStart = daysAgo(ADHERENCE_WINDOW_DAYS - 1);
        const [medsData, logsData, rangeLogsData] = await Promise.all([
          request<{ medications: Medication[] }>("/medications"),
          request<{ logs: MedicationLog[] }>(`/medication-logs/${today()}`),
          request<{ logs: MedicationLog[] }>(
            `/medication-logs?from=${windowStart}&to=${today()}`,
          ),
        ]);
        if (ignore) return;
        setMedications(medsData.medications);
        const next: Partial<Record<string, MedicationLogStatus>> = {};
        for (const log of logsData.logs) next[log.medicationId] = log.status;
        setLogStatuses(next);
        setRecentLogs(rangeLogsData.logs);
      } catch (err) {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Failed to load medications");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    load();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const medication = await request<Medication>("/medications", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), durationDays }),
      });
      setMedications((prev) => [medication, ...prev]);
      setName("");
      setDurationDays(7);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add medication");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(medicationId: string) {
    setPending(medicationId);
    setError(null);
    try {
      await request(`/medications/${medicationId}`, { method: "DELETE" });
      setMedications((prev) => prev.filter((m) => m.medicationId !== medicationId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete medication");
    } finally {
      setPending(null);
    }
  }

  async function setLogStatus(medicationId: string, status: MedicationLogStatus) {
    setPending(medicationId);
    setError(null);
    try {
      const updated = await request<MedicationLog>(`/medication-logs/${today()}/${medicationId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setLogStatuses((prev) => ({ ...prev, [medicationId]: updated.status }));
      // Keep the adherence stat in sync immediately rather than waiting for a reload.
      setRecentLogs((prev) => [...prev.filter((l) => l.dateMedicationId !== updated.dateMedicationId), updated]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update medication log");
    } finally {
      setPending(null);
    }
  }

  const activeMedications = medications.filter(
    (m) => today() >= m.startDate && today() <= m.endDate,
  );

  return (
    <div className={page}>
      <h1 className={pageTitle}>Medications</h1>

      <form onSubmit={handleAdd} className={`mb-8 flex flex-col gap-3 ${card}`}>
        <div>
          <label className={label}>Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Amoxicillin"
            className={`w-full ${input}`}
          />
        </div>
        <div>
          <label className={label}>Duration</label>
          <div className="flex items-center gap-2">
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setDurationDays(preset)}
                className={`${pillButton} px-3 py-1 ${
                  durationDays === preset ? pillButtonDone : pillButtonInactive
                }`}
              >
                {preset} days
              </button>
            ))}
            <input
              type="number"
              min={1}
              value={durationDays}
              onChange={(e) => setDurationDays(Number(e.target.value))}
              className={`w-20 py-1 ${input}`}
            />
            <span className={mutedText}>days</span>
          </div>
        </div>
        <button type="submit" disabled={saving} className={`self-start ${primaryButton}`}>
          {saving ? "Adding..." : "Add medication"}
        </button>
      </form>

      {error && <p className={`mb-4 ${errorText}`}>{error}</p>}

      {loading ? (
        <p className={mutedText}>Loading...</p>
      ) : (
        <>
          <h2 className={`mb-2 ${sectionLabel}`}>Today ({today()})</h2>
          {activeMedications.length === 0 ? (
            <p className={`mb-6 ${mutedText}`}>No active medications today.</p>
          ) : (
            <ul className="mb-6 flex flex-col gap-2">
              {activeMedications.map((medication) => {
                const status = logStatuses[medication.medicationId];
                return (
                  <li key={medication.medicationId} className={`flex items-center justify-between gap-3 ${card}`}>
                    <span className="text-sm font-medium text-ink dark:text-paper">
                      {medication.name}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={pending === medication.medicationId}
                        onClick={() => setLogStatus(medication.medicationId, "taken")}
                        className={`${pillButton} px-3 py-1 ${
                          status === "taken" ? pillButtonDone : pillButtonInactive
                        }`}
                      >
                        Taken
                      </button>
                      <button
                        type="button"
                        disabled={pending === medication.medicationId}
                        onClick={() => setLogStatus(medication.medicationId, "missed")}
                        className={`${pillButton} px-3 py-1 ${
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

          <h2 className={`mb-2 ${sectionLabel}`}>All medications</h2>
          {medications.length === 0 ? (
            <p className={mutedText}>No medications added yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {medications.map((medication) => {
                const adherence = computeAdherence(
                  medication,
                  recentLogs,
                  daysAgo(ADHERENCE_WINDOW_DAYS - 1),
                  today(),
                );
                return (
                  <li key={medication.medicationId} className={`flex items-center justify-between gap-3 ${card}`}>
                    <div>
                      <p className="text-sm font-medium text-ink dark:text-paper">{medication.name}</p>
                      <p className="text-xs text-ink-muted dark:text-mist-muted">
                        {medication.startDate} → {medication.endDate} ({medication.durationDays} days)
                        {adherence !== null && (
                          <>
                            {" · "}
                            <span
                              className={
                                adherence >= 80
                                  ? "text-bloom"
                                  : adherence >= 50
                                    ? "text-amber-ink dark:text-amber-ink-dark"
                                    : "text-alert"
                              }
                            >
                              {adherence}% adherence
                            </span>{" "}
                            (last {ADHERENCE_WINDOW_DAYS}d)
                          </>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={pending === medication.medicationId}
                      onClick={() => handleDelete(medication.medicationId)}
                      className={`${secondaryButton} px-3 py-1.5 text-xs`}
                    >
                      Delete
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
