import { useState } from "react";
import { useApi } from "../api/useApi";
import type { JournalEntry, LogEntry, Task } from "../types";
import { card, errorText, mutedText, primaryButton, sectionLabel } from "./ui";

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function DataExport() {
  const { request } = useApi();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const [tasksData, journalData, logsData] = await Promise.all([
        request<{ tasks: Task[] }>("/tasks"),
        request<{ entries: JournalEntry[] }>("/journal"),
        request<{ entries: LogEntry[] }>("/logs"),
      ]);

      const rows: string[][] = [["type", "date", "summary", "details"]];

      for (const task of tasksData.tasks) {
        rows.push([
          "task",
          task.dueDate ?? "",
          task.title,
          JSON.stringify({
            priority: task.priority,
            status: task.status,
            dueTime: task.dueTime,
            estimatedHours: task.estimatedHours,
          }),
        ]);
      }
      for (const entry of journalData.entries) {
        rows.push([
          "journal",
          entry.date,
          entry.text.slice(0, 80),
          JSON.stringify({ voiceInput: entry.voiceInput, fullText: entry.text }),
        ]);
      }
      for (const logEntry of logsData.entries) {
        rows.push([logEntry.logType, logEntry.date, "", JSON.stringify(logEntry.data)]);
      }

      downloadCsv(`lifeos-export-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export data");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className={card}>
      <h2 className={`mb-2 ${sectionLabel}`}>Export data</h2>
      <p className={`mb-3 ${mutedText}`}>
        Download your tasks, journal entries, and logs (sleep, weight, mood, cycle, food, calls,
        expenses) as a single CSV file — useful for backups or sharing with a healthcare
        provider.
      </p>
      {error && <p className={`mb-2 ${errorText}`}>{error}</p>}
      <button
        type="button"
        onClick={handleExport}
        disabled={exporting}
        className={`${primaryButton} px-3 py-1.5 text-xs`}
      >
        {exporting ? "Preparing..." : "Export as CSV"}
      </button>
    </div>
  );
}
