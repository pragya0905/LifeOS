import { useState } from "react";
import { useApi } from "../api/useApi";
import { todayLocal } from "../lib/date";
import type { Expense, JournalEntry, LogEntry, Task } from "../types";
import { card, errorText, mutedText, primaryButton, secondaryButton, sectionLabel } from "./ui";

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function fetchExportData(request: ReturnType<typeof useApi>["request"]) {
  const [tasksData, journalData, logsData, expensesData] = await Promise.all([
    request<{ tasks: Task[] }>("/tasks"),
    request<{ entries: JournalEntry[] }>("/journal"),
    request<{ entries: LogEntry[] }>("/logs"),
    request<{ expenses: Expense[] }>("/expenses"),
  ]);
  return {
    tasks: tasksData.tasks,
    journalEntries: journalData.entries,
    logs: logsData.entries,
    expenses: expensesData.expenses,
  };
}

export default function DataExport() {
  const { request } = useApi();
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExportCsv() {
    setExportingCsv(true);
    setError(null);
    try {
      const { tasks, journalEntries, logs, expenses } = await fetchExportData(request);
      const rows: string[][] = [["type", "date", "summary", "details"]];

      for (const task of tasks) {
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
      for (const entry of journalEntries) {
        rows.push([
          "journal",
          entry.date,
          entry.text.slice(0, 80),
          JSON.stringify({ voiceInput: entry.voiceInput, fullText: entry.text }),
        ]);
      }
      for (const logEntry of logs) {
        rows.push([logEntry.logType, logEntry.date, "", JSON.stringify(logEntry.data)]);
      }
      for (const expense of expenses) {
        rows.push([
          "expense",
          expense.date,
          `${expense.category} — ₹${expense.amount}`,
          JSON.stringify({ category: expense.category, amount: expense.amount, note: expense.note }),
        ]);
      }

      downloadCsv(`lifeos-export-${todayLocal()}.csv`, toCsv(rows));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export data");
    } finally {
      setExportingCsv(false);
    }
  }

  async function handleExportPdf() {
    setExportingPdf(true);
    setError(null);
    try {
      const { tasks, journalEntries, logs, expenses } = await fetchExportData(request);
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        setError("Your browser blocked the print window — allow pop-ups for this site and try again.");
        return;
      }

      const taskRows = tasks
        .map(
          (t) =>
            `<tr><td>${escapeHtml(t.title)}</td><td>${t.dueDate ?? ""}${t.dueTime ? ` ${t.dueTime}` : ""}</td><td>${t.priority}</td><td>${t.status}</td></tr>`,
        )
        .join("");
      const journalRows = journalEntries
        .map(
          (e) =>
            `<tr><td>${e.date}</td><td>${escapeHtml(e.text)}</td></tr>`,
        )
        .join("");
      const logRows = logs
        .map(
          (l) =>
            `<tr><td>${l.date}</td><td>${escapeHtml(l.logType)}</td><td>${escapeHtml(JSON.stringify(l.data))}</td></tr>`,
        )
        .join("");
      const expenseRows = expenses
        .map(
          (e) =>
            `<tr><td>${e.date}</td><td>${escapeHtml(e.category)}</td><td>₹${e.amount}</td><td>${escapeHtml(e.note ?? "")}</td></tr>`,
        )
        .join("");

      printWindow.document.write(`
        <!doctype html>
        <html>
        <head>
          <title>LifeOs export — ${todayLocal()}</title>
          <style>
            body { font-family: system-ui, sans-serif; color: #241b2e; padding: 24px; }
            h1 { font-size: 20px; }
            h2 { font-size: 15px; margin-top: 28px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
            th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
            th { color: #6b5f72; font-weight: 600; }
            @media print { h2 { break-before: auto; } tr { break-inside: avoid; } }
          </style>
        </head>
        <body>
          <h1>LifeOs export — ${todayLocal()}</h1>
          <h2>Tasks (${tasks.length})</h2>
          <table><tr><th>Title</th><th>Due</th><th>Priority</th><th>Status</th></tr>${taskRows || "<tr><td colspan=4>None</td></tr>"}</table>
          <h2>Journal entries (${journalEntries.length})</h2>
          <table><tr><th>Date</th><th>Entry</th></tr>${journalRows || "<tr><td colspan=2>None</td></tr>"}</table>
          <h2>Logs (${logs.length})</h2>
          <table><tr><th>Date</th><th>Type</th><th>Details</th></tr>${logRows || "<tr><td colspan=3>None</td></tr>"}</table>
          <h2>Expenses (${expenses.length})</h2>
          <table><tr><th>Date</th><th>Category</th><th>Amount</th><th>Note</th></tr>${expenseRows || "<tr><td colspan=4>None</td></tr>"}</table>
          <script>window.onload = () => window.print();</script>
        </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export data");
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <div className={card}>
      <h2 className={`mb-2 ${sectionLabel}`}>Export data</h2>
      <p className={`mb-3 ${mutedText}`}>
        Download your tasks, journal entries, logs (sleep, weight, mood, cycle, food, calls), and
        expenses — useful for backups or sharing with a healthcare provider.
      </p>
      {error && <p className={`mb-2 ${errorText}`}>{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={exportingCsv}
          className={`${primaryButton} px-3 py-1.5 text-xs`}
        >
          {exportingCsv ? "Preparing..." : "Export as CSV"}
        </button>
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={exportingPdf}
          className={`${secondaryButton} px-3 py-1.5 text-xs`}
        >
          {exportingPdf ? "Preparing..." : "Export as PDF"}
        </button>
      </div>
    </div>
  );
}
