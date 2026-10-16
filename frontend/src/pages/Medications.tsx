import { useEffect, useState, type FormEvent } from "react";
import { Bell, Timer } from "lucide-react";
import { useApi } from "../api/useApi";
import { todayLocal, toLocalDateStr } from "../lib/date";
import { ALL_DAYS, appliesOnDate, byTimeOfDay, formatSchedule } from "../lib/weekdays";
import { URGENCY_BADGE_CLASS } from "../lib/urgency";
import { Skeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import DayOfWeekPicker from "../components/DayOfWeekPicker";
import { MedicationStatusButtons } from "../components/MedicationStatusButtons";
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


// Below this many scheduled days of history (after excluding Skipped — see below), a
// percentage is more misleading than useful (a brand-new medication reads as "0%
// adherence" in alert-red before its first dose is even due) — those render as "New".
const ADHERENCE_MIN_ACTIVE_DAYS = 3;

export type AdherenceResult =
  | { status: "ok"; percent: number; skippedDays: number }
  | { status: "new"; skippedDays: number }
  // Every scheduled day in the window was explicitly Skipped — there's no "taken vs missed"
  // data to turn into a percentage at all, so this is reported distinctly rather than as a
  // misleading 0%.
  | { status: "allSkipped"; skippedDays: number }
  | null;

// % of scheduled days (within the last 14 days, clamped to the medication's own start/end
// date range and its own daysOfWeek) logged as "taken", EXCLUDING Skipped days from the
// denominator entirely — a deliberate skip (sick, travelling, doctor's advice) shouldn't
// drag adherence down the way an unexplained miss does. Days with no log at all still count
// against adherence, same as "missed" — only an explicit "skipped" status is excluded.
function computeAdherence(
  medication: Medication,
  logs: MedicationLog[],
  windowStart: string,
  windowEnd: string,
): AdherenceResult {
  const activeStart = medication.startDate > windowStart ? medication.startDate : windowStart;
  const activeEnd = medication.endDate < windowEnd ? medication.endDate : windowEnd;
  if (activeStart > activeEnd) return null;

  const statusByDate = new Map<string, MedicationLogStatus>();
  for (const l of logs) {
    if (l.medicationId === medication.medicationId) statusByDate.set(l.date, l.status);
  }

  let scheduledDays = 0;
  let takenDays = 0;
  let skippedDays = 0;
  const cursor = new Date(`${activeStart}T00:00:00Z`);
  const end = new Date(`${activeEnd}T00:00:00Z`);
  while (cursor <= end) {
    // Skip days this medication isn't actually scheduled for (e.g. a weekly medication's
    // off-days) — otherwise those would count as "missed" and drag adherence down for
    // something that was never supposed to be taken that day in the first place.
    if (!medication.daysOfWeek || medication.daysOfWeek.length === 0 || medication.daysOfWeek.includes(cursor.getUTCDay())) {
      const d = cursor.toISOString().slice(0, 10);
      const status = statusByDate.get(d);
      if (status === "skipped") {
        skippedDays += 1;
      } else {
        scheduledDays += 1;
        if (status === "taken") takenDays += 1;
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (scheduledDays === 0 && skippedDays === 0) return null;
  if (scheduledDays === 0) return { status: "allSkipped", skippedDays };
  if (scheduledDays < ADHERENCE_MIN_ACTIVE_DAYS) return { status: "new", skippedDays };
  return { status: "ok", percent: Math.round((takenDays / scheduledDays) * 100), skippedDays };
}

function MedicationCard({
  medication,
  adherence,
  pending,
  removing,
  onDelete,
  onSave,
}: {
  medication: Medication;
  adherence: AdherenceResult;
  pending: boolean;
  removing: boolean;
  onDelete: (medicationId: string) => void;
  onSave: (
    medicationId: string,
    patch: {
      name: string;
      dosage?: string;
      notes?: string;
      startDate: string;
      durationDays: number;
      timeOfDay?: string;
      timezoneOffsetMinutes?: number;
      daysOfWeek: number[];
      estimatedMinutes?: number;
    },
  ) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(medication.name);
  const [dosageDraft, setDosageDraft] = useState(medication.dosage ?? "");
  const [notesDraft, setNotesDraft] = useState(medication.notes ?? "");
  const [timeOfDayDraft, setTimeOfDayDraft] = useState(medication.timeOfDay ?? "");
  const [estimatedMinutesDraft, setEstimatedMinutesDraft] = useState(
    medication.estimatedMinutes !== undefined ? String(medication.estimatedMinutes) : "",
  );
  const [startDateDraft, setStartDateDraft] = useState(medication.startDate);
  const [durationDaysDraft, setDurationDaysDraft] = useState(medication.durationDays);
  const [daysOfWeekDraft, setDaysOfWeekDraft] = useState<number[]>(
    medication.daysOfWeek && medication.daysOfWeek.length > 0 ? medication.daysOfWeek : ALL_DAYS,
  );
  const [savingEdit, setSavingEdit] = useState(false);

  function toggleDraftDay(day: number) {
    setDaysOfWeekDraft((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  }

  async function handleSaveEdit() {
    if (!nameDraft.trim() || daysOfWeekDraft.length === 0 || durationDaysDraft < 1) return;
    setSavingEdit(true);
    try {
      await onSave(medication.medicationId, {
        name: nameDraft.trim(),
        dosage: dosageDraft.trim() || undefined,
        notes: notesDraft.trim() || undefined,
        startDate: startDateDraft,
        durationDays: durationDaysDraft,
        timeOfDay: timeOfDayDraft || undefined,
        timezoneOffsetMinutes: timeOfDayDraft ? new Date().getTimezoneOffset() : undefined,
        daysOfWeek: daysOfWeekDraft.length === 7 ? [] : daysOfWeekDraft,
        estimatedMinutes: estimatedMinutesDraft ? Number(estimatedMinutesDraft) : undefined,
      });
      setEditing(false);
    } finally {
      setSavingEdit(false);
    }
  }

  if (editing) {
    return (
      <li className={card}>
        <div className="mb-2 flex flex-wrap gap-3">
          <div className="min-w-[200px] flex-1">
            <label className={label}>Name</label>
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className={`w-full ${input}`}
            />
          </div>
          <div>
            <label className={label}>Dosage</label>
            <input
              type="text"
              value={dosageDraft}
              onChange={(e) => setDosageDraft(e.target.value)}
              placeholder="e.g. 500mg"
              className={`w-32 ${input}`}
            />
          </div>
          <div>
            <label className={label}>Reminder time</label>
            <input
              type="time"
              value={timeOfDayDraft}
              onChange={(e) => setTimeOfDayDraft(e.target.value)}
              className={input}
            />
          </div>
          <div>
            <label className={label}>Takes about (min)</label>
            <input
              type="number"
              min={1}
              value={estimatedMinutesDraft}
              onChange={(e) => setEstimatedMinutesDraft(e.target.value)}
              placeholder="e.g. 10"
              className={`w-24 ${input}`}
            />
          </div>
        </div>
        <label className={label}>Notes</label>
        <input
          type="text"
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          placeholder="e.g. take with food"
          className={`mb-2 w-full ${input}`}
        />
        <div className="mb-2 flex flex-wrap gap-3">
          <div>
            <label className={label}>Start date</label>
            <input
              type="date"
              value={startDateDraft}
              onChange={(e) => setStartDateDraft(e.target.value)}
              className={input}
            />
          </div>
          <div>
            <label className={label}>Duration (days)</label>
            <input
              type="number"
              min={1}
              value={durationDaysDraft}
              onChange={(e) => setDurationDaysDraft(Number(e.target.value))}
              className={`w-24 ${input}`}
            />
          </div>
        </div>
        <label className={label}>Days</label>
        <div className="mb-2">
          <DayOfWeekPicker selected={daysOfWeekDraft} onToggle={toggleDraftDay} />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={savingEdit || daysOfWeekDraft.length === 0 || !nameDraft.trim() || durationDaysDraft < 1}
            onClick={handleSaveEdit}
            className={`${secondaryButton} px-3 py-1 text-xs`}
          >
            {savingEdit ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className={`${secondaryButton} px-3 py-1 text-xs`}
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-3 transition-all duration-200 ${card} ${removing ? "scale-[0.98] opacity-0" : "scale-100 opacity-100"}`}
    >
      <div>
        <p className="text-sm font-medium text-ink dark:text-paper">
          {medication.name}
          {medication.dosage && <span className={`ml-1.5 font-normal ${mutedText}`}>{medication.dosage}</span>}
        </p>
        <p className="text-xs text-ink-muted dark:text-mist-muted">
          {medication.startDate} → {medication.endDate} ({medication.durationDays} days)
          {medication.timeOfDay && (
            <>
              {" · "}
              <Icon icon={Bell} size={12} className="inline" /> {medication.timeOfDay}
            </>
          )}
          {medication.estimatedMinutes !== undefined && (
            <>
              {" · "}
              <Icon icon={Timer} size={12} className="inline" /> ~{medication.estimatedMinutes} min
            </>
          )}
          {medication.daysOfWeek && medication.daysOfWeek.length > 0 && medication.daysOfWeek.length < 7
            ? ` · ${formatSchedule(medication.daysOfWeek)}`
            : ""}
        </p>
        {medication.notes && (
          <p className="mt-0.5 text-xs italic text-ink-muted dark:text-mist-muted">{medication.notes}</p>
        )}
        {adherence && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {adherence.status === "new" && (
              <span className="inline-block rounded-full bg-stone px-2 py-0.5 text-xs font-medium text-ink-muted dark:bg-stone-dark dark:text-mist-muted">
                New — not enough history yet
              </span>
            )}
            {adherence.status === "allSkipped" && (
              <span className="inline-block rounded-full bg-stone px-2 py-0.5 text-xs font-medium text-ink-muted dark:bg-stone-dark dark:text-mist-muted">
                All {adherence.skippedDays}d skipped — no adherence data yet
              </span>
            )}
            {adherence.status === "ok" && (
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
                  URGENCY_BADGE_CLASS[adherence.percent >= 80 ? "low" : adherence.percent >= 50 ? "medium" : "high"]
                }`}
              >
                {adherence.percent}% adherence (last {ADHERENCE_WINDOW_DAYS}d)
              </span>
            )}
            {(adherence.status === "ok" || adherence.status === "new") && adherence.skippedDays > 0 && (
              <span className="inline-block rounded-full bg-slate-soft px-2 py-0.5 text-xs font-medium text-slate-ink dark:bg-slate-soft-dark dark:text-slate-ink-dark">
                {adherence.skippedDays} skipped
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-bloom hover:underline"
        >
          Edit
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => onDelete(medication.medicationId)}
          className={`${secondaryButton} px-3 py-1.5 text-xs`}
        >
          Delete
        </button>
      </div>
    </li>
  );
}

export default function Medications() {
  const { request } = useApi();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [logStatuses, setLogStatuses] = useState<Partial<Record<string, MedicationLogStatus>>>({});
  const [logNotes, setLogNotes] = useState<Partial<Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [notes, setNotes] = useState("");
  const [timeOfDay, setTimeOfDay] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [durationDays, setDurationDays] = useState(7);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(ALL_DAYS);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [recentLogs, setRecentLogs] = useState<MedicationLog[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);

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
        const nextNotes: Partial<Record<string, string>> = {};
        for (const log of logsData.logs) {
          next[log.medicationId] = log.status;
          if (log.note) nextNotes[log.medicationId] = log.note;
        }
        setLogStatuses(next);
        setLogNotes(nextNotes);
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

  function toggleDay(day: number) {
    setDaysOfWeek((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || daysOfWeek.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const medication = await request<Medication>("/medications", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          durationDays,
          dosage: dosage.trim() || undefined,
          notes: notes.trim() || undefined,
          timeOfDay: timeOfDay || undefined,
          timezoneOffsetMinutes: timeOfDay ? new Date().getTimezoneOffset() : undefined,
          daysOfWeek: daysOfWeek.length === 7 ? [] : daysOfWeek,
          estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,
        }),
      });
      setMedications((prev) => [medication, ...prev]);
      setName("");
      setDosage("");
      setNotes("");
      setTimeOfDay("");
      setEstimatedMinutes("");
      setDurationDays(7);
      setDaysOfWeek(ALL_DAYS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add medication");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(medicationId: string) {
    setPending(medicationId);
    setRemovingId(medicationId);
    setError(null);
    const transitionDone = new Promise((resolve) => setTimeout(resolve, 200));
    try {
      await Promise.all([
        request(`/medications/${medicationId}`, { method: "DELETE" }),
        transitionDone,
      ]);
      setMedications((prev) => prev.filter((m) => m.medicationId !== medicationId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete medication");
    } finally {
      setPending(null);
      setRemovingId(null);
    }
  }

  async function handleSaveEdit(
    medicationId: string,
    patch: {
      name: string;
      dosage?: string;
      notes?: string;
      startDate: string;
      durationDays: number;
      timeOfDay?: string;
      timezoneOffsetMinutes?: number;
      daysOfWeek: number[];
    },
  ) {
    setError(null);
    try {
      const updated = await request<Medication>(`/medications/${medicationId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setMedications((prev) => prev.map((m) => (m.medicationId === medicationId ? updated : m)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save medication");
      throw err;
    }
  }

  async function setLogStatus(medicationId: string, status: MedicationLogStatus, note?: string) {
    setPending(medicationId);
    setError(null);
    try {
      const updated = await request<MedicationLog>(`/medication-logs/${today()}/${medicationId}`, {
        method: "PATCH",
        body: JSON.stringify({ status, note: note ?? "" }),
      });
      setLogStatuses((prev) => ({ ...prev, [medicationId]: updated.status }));
      setLogNotes((prev) => ({ ...prev, [medicationId]: updated.note ?? "" }));
      // Keep the adherence stat in sync immediately rather than waiting for a reload.
      setRecentLogs((prev) => [...prev.filter((l) => l.dateMedicationId !== updated.dateMedicationId), updated]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update medication log");
    } finally {
      setPending(null);
    }
  }

  const activeMedications = medications
    .filter((m) => today() >= m.startDate && today() <= m.endDate && appliesOnDate(m.daysOfWeek, new Date()))
    .sort(byTimeOfDay);

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
        <div className="flex flex-wrap gap-3">
          <div>
            <label className={label}>Dosage (optional)</label>
            <input
              type="text"
              value={dosage}
              onChange={(e) => setDosage(e.target.value)}
              placeholder="e.g. 500mg"
              className={`w-32 ${input}`}
            />
          </div>
          <div>
            <label className={label}>Reminder time (optional)</label>
            <input
              type="time"
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(e.target.value)}
              className={input}
            />
          </div>
          <div>
            <label className={label}>Takes about (min, optional)</label>
            <input
              type="number"
              min={1}
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
              placeholder="e.g. 10"
              className={`w-24 ${input}`}
            />
          </div>
        </div>
        <div>
          <label className={label}>Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. take with food"
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
        <div>
          <label className={label}>Days</label>
          <DayOfWeekPicker selected={daysOfWeek} onToggle={toggleDay} />
          <p className={`mt-1 ${mutedText}`}>
            {daysOfWeek.length === 7
              ? "Taken every day of the week."
              : `Taken on: ${formatSchedule(daysOfWeek)} — e.g. for something you only take weekly.`}
          </p>
        </div>
        {timeOfDay && (
          <p className={`inline-flex items-start gap-1 ${mutedText}`}>
            <Icon icon={Bell} size={13} className="mt-0.5 shrink-0" />
            You'll get a push reminder around {timeOfDay} on days this medication is scheduled
            for, unless you've already marked it taken.
          </p>
        )}
        <button
          type="submit"
          disabled={saving || daysOfWeek.length === 0}
          className={`self-start ${primaryButton}`}
        >
          {saving ? "Adding..." : "Add medication"}
        </button>
      </form>

      {error && <p className={`mb-4 ${errorText}`}>{error}</p>}

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <h2 className={`mb-2 ${sectionLabel}`}>Today ({today()})</h2>
          {activeMedications.length === 0 ? (
            <p className={`mb-6 ${mutedText}`}>No active medications today.</p>
          ) : (
            <ul className="mb-6 flex flex-col gap-2">
              {activeMedications.map((medication) => {
                const status = logStatuses[medication.medicationId];
                const noteValue = logNotes[medication.medicationId];
                return (
                  <li key={medication.medicationId} className={`flex flex-col gap-2 ${card}`}>
                    <span className="text-sm font-medium text-ink dark:text-paper">
                      {medication.name}
                      {medication.dosage && (
                        <span className={`ml-1.5 font-normal ${mutedText}`}>{medication.dosage}</span>
                      )}
                      {medication.timeOfDay && (
                        <span className={`ml-1.5 inline-flex items-center gap-1 font-normal ${mutedText}`}>
                          <Icon icon={Bell} size={12} /> {medication.timeOfDay}
                        </span>
                      )}
                      {medication.estimatedMinutes !== undefined && (
                        <span className={`ml-1.5 inline-flex items-center gap-1 font-normal ${mutedText}`}>
                          <Icon icon={Timer} size={12} />~{medication.estimatedMinutes} min
                        </span>
                      )}
                      {medication.notes && (
                        <span className="block text-xs font-normal italic text-ink-muted dark:text-mist-muted">
                          {medication.notes}
                        </span>
                      )}
                    </span>
                    <MedicationStatusButtons
                      status={status ?? null}
                      note={noteValue}
                      pending={pending === medication.medicationId}
                      onSetStatus={(next, nextNote) => void setLogStatus(medication.medicationId, next, nextNote)}
                    />
                  </li>
                );
              })}
            </ul>
          )}

          <h2 className={`mb-2 ${sectionLabel}`}>All medications</h2>
          {medications.length === 0 ? (
            <EmptyState icon="💊" title="No medications added yet" hint="Add your first medication above." />
          ) : (
            <ul className="flex flex-col gap-2">
              {[...medications].sort(byTimeOfDay).map((medication) => (
                <MedicationCard
                  key={medication.medicationId}
                  medication={medication}
                  adherence={computeAdherence(medication, recentLogs, daysAgo(ADHERENCE_WINDOW_DAYS - 1), today())}
                  pending={pending === medication.medicationId}
                  removing={removingId === medication.medicationId}
                  onDelete={handleDelete}
                  onSave={handleSaveEdit}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
