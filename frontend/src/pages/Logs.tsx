import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../api/useApi";
import type { LogEntry, LogType } from "../types";

interface FieldConfig {
  key: string;
  label: string;
  type: "text" | "number" | "time" | "select";
  options?: string[];
  optional?: boolean;
}

const LOG_TYPE_CONFIG: Record<LogType, { label: string; fields: FieldConfig[] }> = {
  food: {
    label: "Food",
    fields: [
      { key: "description", label: "Description", type: "text" },
      {
        key: "mealType",
        label: "Meal",
        type: "select",
        options: ["breakfast", "lunch", "dinner", "snack"],
        optional: true,
      },
    ],
  },
  sleep: {
    label: "Sleep",
    fields: [
      { key: "bedTime", label: "Bed time", type: "time" },
      { key: "wakeTime", label: "Wake time", type: "time" },
    ],
  },
  weight: {
    label: "Weight",
    fields: [{ key: "valueKg", label: "Weight (kg)", type: "number" }],
  },
  bodyFat: {
    label: "Body fat %",
    fields: [{ key: "percentage", label: "Body fat %", type: "number" }],
  },
  mood: {
    label: "Mood",
    fields: [
      { key: "rating", label: "Rating (1-5)", type: "select", options: ["1", "2", "3", "4", "5"] },
      { key: "note", label: "Note", type: "text", optional: true },
    ],
  },
  call: {
    label: "Call",
    fields: [
      { key: "personName", label: "Person", type: "text" },
      { key: "note", label: "Note", type: "text", optional: true },
    ],
  },
  expense: {
    label: "Expense",
    fields: [
      { key: "category", label: "Category", type: "text" },
      { key: "amount", label: "Amount", type: "number", optional: true },
      { key: "note", label: "Note", type: "text", optional: true },
    ],
  },
  cycle: {
    label: "Cycle",
    fields: [
      {
        key: "event",
        label: "Event",
        type: "select",
        options: ["period_start", "period_end", "symptom"],
      },
      { key: "note", label: "Note", type: "text", optional: true },
    ],
  },
};

const LOG_TYPES = Object.keys(LOG_TYPE_CONFIG) as LogType[];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildData(fields: FieldConfig[], raw: Record<string, string>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    const value = raw[field.key];
    if (value === undefined || value === "") continue;
    data[field.key] = field.type === "number" || field.key === "rating" ? Number(value) : value;
  }
  return data;
}

function summarize(logType: LogType, data: Record<string, unknown>): string {
  const fields = LOG_TYPE_CONFIG[logType].fields;
  return fields
    .map((f) => (data[f.key] !== undefined ? `${f.label}: ${data[f.key]}` : null))
    .filter(Boolean)
    .join(" · ");
}

function FieldInputs({
  fields,
  values,
  onChange,
}: {
  fields: FieldConfig[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <>
      {fields.map((field) => (
        <div key={field.key}>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            {field.label}
          </label>
          {field.type === "select" ? (
            <select
              required={!field.optional}
              value={values[field.key] ?? ""}
              onChange={(e) => onChange(field.key, e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="" disabled>
                Select...
              </option>
              {field.options?.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={field.type}
              required={!field.optional}
              value={values[field.key] ?? ""}
              onChange={(e) => onChange(field.key, e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          )}
        </div>
      ))}
    </>
  );
}

export default function Logs() {
  const { request } = useApi();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [logType, setLogType] = useState<LogType>("food");
  const [date, setDate] = useState(today());
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await request<{ entries: LogEntry[] }>("/logs");
        if (ignore) return;
        setEntries(data.entries.slice().sort((a, b) => (a.date < b.date ? 1 : -1)));
      } catch (err) {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Failed to load log entries");
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

  function handleTypeChange(next: LogType) {
    setLogType(next);
    setValues({});
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const entry = await request<LogEntry>("/logs", {
        method: "POST",
        body: JSON.stringify({
          logType,
          date,
          data: buildData(LOG_TYPE_CONFIG[logType].fields, values),
        }),
      });
      setEntries((prev) => [entry, ...prev].sort((a, b) => (a.date < b.date ? 1 : -1)));
      setValues({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save log entry");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(entry: LogEntry) {
    setEditingId(entry.logId);
    const raw: Record<string, string> = {};
    for (const field of LOG_TYPE_CONFIG[entry.logType].fields) {
      const value = entry.data[field.key];
      if (value !== undefined) raw[field.key] = String(value);
    }
    setEditValues(raw);
  }

  async function saveEdit(entry: LogEntry) {
    setSavingEdit(true);
    setError(null);
    try {
      const updated = await request<LogEntry>(`/logs/${entry.logId}`, {
        method: "PATCH",
        body: JSON.stringify({ data: buildData(LOG_TYPE_CONFIG[entry.logType].fields, editValues) }),
      });
      setEntries((prev) => prev.map((e) => (e.logId === entry.logId ? updated : e)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update log entry");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(logId: string) {
    setError(null);
    try {
      await request(`/logs/${logId}`, { method: "DELETE" });
      setEntries((prev) => prev.filter((e) => e.logId !== logId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete log entry");
    }
  }

  return (
    <div className="mx-auto mt-8 w-full max-w-2xl px-4">
      <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">Quick Log</h1>

      <form
        onSubmit={handleCreate}
        className="mb-8 flex flex-wrap items-end gap-3 rounded-md border border-gray-200 p-4 dark:border-gray-700"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            Type
          </label>
          <select
            value={logType}
            onChange={(e) => handleTypeChange(e.target.value as LogType)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            {LOG_TYPES.map((t) => (
              <option key={t} value={t}>
                {LOG_TYPE_CONFIG[t].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            Date
          </label>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <FieldInputs
          fields={LOG_TYPE_CONFIG[logType].fields}
          values={values}
          onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Add entry"}
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading entries...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-500">No log entries yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li
              key={entry.logId}
              className="flex flex-col gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-700"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                      {LOG_TYPE_CONFIG[entry.logType].label}
                    </span>
                    {entry.date}
                  </p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {summarize(entry.logType, entry.data)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => (editingId === entry.logId ? setEditingId(null) : startEdit(entry))}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
                  >
                    {editingId === entry.logId ? "Cancel" : "Edit"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(entry.logId)}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {editingId === entry.logId && (
                <div className="flex flex-wrap items-end gap-3 border-t border-gray-100 pt-3 dark:border-gray-800">
                  <FieldInputs
                    fields={LOG_TYPE_CONFIG[entry.logType].fields}
                    values={editValues}
                    onChange={(key, value) => setEditValues((prev) => ({ ...prev, [key]: value }))}
                  />
                  <button
                    type="button"
                    disabled={savingEdit}
                    onClick={() => saveEdit(entry)}
                    className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {savingEdit ? "Saving..." : "Save"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
