import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../api/useApi";
import type { Medication, MedicationLog, MedicationLogStatus } from "../types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const DURATION_PRESETS = [7, 30];

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

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [medsData, logsData] = await Promise.all([
          request<{ medications: Medication[] }>("/medications"),
          request<{ logs: MedicationLog[] }>(`/medication-logs/${today()}`),
        ]);
        if (ignore) return;
        setMedications(medsData.medications);
        const next: Partial<Record<string, MedicationLogStatus>> = {};
        for (const log of logsData.logs) next[log.medicationId] = log.status;
        setLogStatuses(next);
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
    <div className="mx-auto mt-8 w-full max-w-2xl px-4">
      <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">Medications</h1>

      <form
        onSubmit={handleAdd}
        className="mb-8 flex flex-col gap-3 rounded-md border border-gray-200 p-4 dark:border-gray-700"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            Name
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Amoxicillin"
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            Duration
          </label>
          <div className="flex items-center gap-2">
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setDurationDays(preset)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  durationDays === preset
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
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
              className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">days</span>
          </div>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="self-start rounded-md bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? "Adding..." : "Add medication"}
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <>
          <h2 className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">
            Today ({today()})
          </h2>
          {activeMedications.length === 0 ? (
            <p className="mb-6 text-sm text-gray-500">No active medications today.</p>
          ) : (
            <ul className="mb-6 flex flex-col gap-2">
              {activeMedications.map((medication) => {
                const status = logStatuses[medication.medicationId];
                return (
                  <li
                    key={medication.medicationId}
                    className="flex items-center justify-between gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-700"
                  >
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {medication.name}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={pending === medication.medicationId}
                        onClick={() => setLogStatus(medication.medicationId, "taken")}
                        className={`rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-50 ${
                          status === "taken"
                            ? "border-green-600 bg-green-600 text-white"
                            : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
                        }`}
                      >
                        Taken
                      </button>
                      <button
                        type="button"
                        disabled={pending === medication.medicationId}
                        onClick={() => setLogStatus(medication.medicationId, "missed")}
                        className={`rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-50 ${
                          status === "missed"
                            ? "border-red-600 bg-red-600 text-white"
                            : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
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

          <h2 className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">
            All medications
          </h2>
          {medications.length === 0 ? (
            <p className="text-sm text-gray-500">No medications added yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {medications.map((medication) => (
                <li
                  key={medication.medicationId}
                  className="flex items-center justify-between gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-700"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {medication.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {medication.startDate} → {medication.endDate} ({medication.durationDays} days)
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={pending === medication.medicationId}
                    onClick={() => handleDelete(medication.medicationId)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
