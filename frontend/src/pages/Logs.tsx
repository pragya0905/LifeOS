import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../api/useApi";
import WeightTrend from "../components/WeightTrend";
import type { LogEntry, LogType } from "../types";
import {
  badge,
  card,
  errorText,
  input,
  label,
  mutedText,
  page,
  pageTitle,
  primaryButton,
  secondaryButton,
} from "../components/ui";

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
          <label className={label}>{field.label}</label>
          {field.type === "select" ? (
            <select
              required={!field.optional}
              value={values[field.key] ?? ""}
              onChange={(e) => onChange(field.key, e.target.value)}
              className={input}
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
              className={input}
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

  const [filterType, setFilterType] = useState<LogType | "all">("all");
  const [search, setSearch] = useState("");

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

  const filteredEntries = entries
    .filter((e) => filterType === "all" || e.logType === filterType)
    .filter(
      (e) =>
        !search.trim() ||
        summarize(e.logType, e.data).toLowerCase().includes(search.trim().toLowerCase()),
    );

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
    <div className={page}>
      <h1 className={pageTitle}>Quick Log</h1>

      <WeightTrend entries={entries} />

      <form onSubmit={handleCreate} className={`mb-8 flex flex-wrap items-end gap-3 ${card}`}>
        <div>
          <label className={label}>Type</label>
          <select
            value={logType}
            onChange={(e) => handleTypeChange(e.target.value as LogType)}
            className={input}
          >
            {LOG_TYPES.map((t) => (
              <option key={t} value={t}>
                {LOG_TYPE_CONFIG[t].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Date</label>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={input}
          />
        </div>
        <FieldInputs
          fields={LOG_TYPE_CONFIG[logType].fields}
          values={values}
          onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
        />
        <button type="submit" disabled={saving} className={primaryButton}>
          {saving ? "Saving..." : "Add entry"}
        </button>
      </form>

      {error && <p className={`mb-4 ${errorText}`}>{error}</p>}

      {entries.length > 0 && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className={label}>Filter by type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as LogType | "all")}
              className={input}
            >
              <option value="all">All types</option>
              {LOG_TYPES.map((t) => (
                <option key={t} value={t}>
                  {LOG_TYPE_CONFIG[t].label}
                </option>
              ))}
            </select>
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entries..."
            aria-label="Search log entries"
            className={`min-w-[200px] flex-1 ${input}`}
          />
        </div>
      )}

      {loading ? (
        <p className={mutedText}>Loading entries...</p>
      ) : entries.length === 0 ? (
        <p className={mutedText}>No log entries yet.</p>
      ) : filteredEntries.length === 0 ? (
        <p className={mutedText}>No matching entries.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filteredEntries.map((entry) => (
            <li key={entry.logId} className={`flex flex-col gap-3 ${card}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-xs font-medium text-ink-muted dark:text-fog-muted">
                    <span className={badge}>{LOG_TYPE_CONFIG[entry.logType].label}</span>
                    {entry.date}
                  </p>
                  <p className="text-sm text-ink dark:text-cream">
                    {summarize(entry.logType, entry.data)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => (editingId === entry.logId ? setEditingId(null) : startEdit(entry))}
                    className={`${secondaryButton} px-2 py-1 text-xs`}
                  >
                    {editingId === entry.logId ? "Cancel" : "Edit"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(entry.logId)}
                    className={`${secondaryButton} px-2 py-1 text-xs`}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {editingId === entry.logId && (
                <div className="flex flex-wrap items-end gap-3 border-t border-stone/60 pt-3 dark:border-stone-dark/60">
                  <FieldInputs
                    fields={LOG_TYPE_CONFIG[entry.logType].fields}
                    values={editValues}
                    onChange={(key, value) => setEditValues((prev) => ({ ...prev, [key]: value }))}
                  />
                  <button
                    type="button"
                    disabled={savingEdit}
                    onClick={() => saveEdit(entry)}
                    className={primaryButton}
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
