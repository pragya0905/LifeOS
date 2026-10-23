import type { AssistantStreamEvent, AssistantToolResultSummary } from "../hooks/useAssistantStream";
import { EXPENSE_CATEGORIES, formatINR } from "./expenseCategories";
import { addDays, formatDueTime, todayLocal } from "./date";

// Everything about a tool-call confirmation card that isn't rendering: what a result looks
// like, whether it can be undone, how a failure is inferred from the stream. Kept pure so it
// can be tested without a DOM.

// Tools whose successful result the backend summarises (backend/src/common/toolResultSummary.ts
// — kept in sync by hand, like the other mirrored types). A tool in this set that starts but
// never returns a `result` is treated as having failed; a tool outside it (get_*, memory tools)
// never returns one, so its silence means nothing.
export const SUMMARISED_TOOLS: ReadonlySet<string> = new Set([
  "create_task", "delete_task",
  "create_medication", "update_medication", "delete_medication",
  "create_routine_template", "update_routine_template", "delete_routine_template",
  "log_routine_step", "log_medication", "log_habit", "log_entry", "update_log_entry",
  "create_wish", "create_expense", "update_expense", "delete_expense",
  "set_budget", "set_goal",
  "set_meal_plan", "set_meal_plan_template", "set_meal_plan_batch", "set_meal_plan_template_batch",
  "log_journal_entry",
]);

export interface ToolResultEntry {
  name: string;
  result: AssistantToolResultSummary;
}

export type ToolFailureKind = "rejected" | "server" | "timeout";

export interface ToolFailure {
  name: string;
  kind: ToolFailureKind;
  // The reason shown beneath the fixed headline. Absent when the reply text itself is the reason.
  reason?: string;
  // True when the assistant's own reply is the explanation: the card then shows that text and
  // the reply body is not repeated above it.
  useReply?: boolean;
}

/* ---------- where a card links ---------- */

export interface ListPage {
  label: string;
  path: string;
}

export function pageForTool(name: string): ListPage {
  if (name.includes("task")) return { label: "Tasks", path: "/tasks" };
  if (name.includes("medication")) return { label: "Medications", path: "/medications" };
  if (name.includes("routine")) return { label: "Routines", path: "/routines" };
  if (name.includes("wish")) return { label: "Wishes", path: "/wishes" };
  if (name.includes("expense") || name.includes("budget")) return { label: "Budget", path: "/budget" };
  if (name.includes("meal_plan")) return { label: "Meal plan", path: "/meal-plan" };
  if (name.includes("journal")) return { label: "Journal", path: "/journal" };
  if (name === "log_entry" || name === "update_log_entry") return { label: "Logs", path: "/logs" };
  return { label: "Today", path: "/dashboard" };
}

/* ---------- presenting a result ---------- */

export type CardVisual = "task" | "medication" | "expense" | "routine" | "habit" | "wish" | "log" | "plan" | "other";

export interface MetaPart {
  text: string;
  priority?: "High" | "Medium" | "Low";
}

export interface CardPresentation {
  visual: CardVisual;
  title: string;
  verb: "Added" | "Logged" | "Updated";
  meta: MetaPart[];
}

const VISUAL_BY_ITEM_TYPE: Record<string, CardVisual> = {
  task: "task",
  medication: "medication",
  medicationLog: "medication",
  expense: "expense",
  budget: "expense",
  routine: "routine",
  routineStep: "routine",
  habit: "habit",
  wish: "wish",
  log: "log",
  mealPlanSlot: "plan",
  mealPlanTemplate: "plan",
  mealPlanBatch: "plan",
};

function verbFor(name: string): CardPresentation["verb"] {
  if (name === "create_expense") return "Logged";
  if (name.startsWith("create_")) return "Added";
  if (name.startsWith("log_")) return "Logged";
  return "Updated";
}

// "2026-10-23" -> "Today" / "Tomorrow" / "Oct 25"; a trailing " 18:00" becomes " 6:00 PM".
export function friendlyWhen(value: string, today: string = todayLocal()): string {
  const [date, time] = value.split(" ");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return value;
  let day: string;
  if (date === today) day = "Today";
  else if (date === addDays(today, 1)) day = "Tomorrow";
  else if (date === addDays(today, -1)) day = "Yesterday";
  else {
    const [y, m, d] = date.split("-").map(Number);
    day = new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  const clock = time ? formatDueTime(time) : undefined;
  return clock ? `${day} ${clock}` : day;
}

export function presentCard(entry: ToolResultEntry, today?: string): CardPresentation | null {
  const { name, result } = entry;
  if (result.deleted) return null;
  const meta: MetaPart[] = [];
  for (const [key, value] of Object.entries(result.fields ?? {})) {
    if (key === "priority" && (value === "High" || value === "Medium" || value === "Low")) {
      meta.push({ text: value, priority: value });
    } else if (key === "due" || key === "date" || key === "target") {
      meta.push({ text: friendlyWhen(value, today) });
    } else if (key === "amount") {
      meta.push({ text: Number.isFinite(Number(value)) ? formatINR(Number(value)) : value });
    } else {
      meta.push({ text: value });
    }
  }
  return { visual: VISUAL_BY_ITEM_TYPE[result.itemType] ?? "other", title: result.title, verb: verbFor(name), meta };
}

/* ---------- Undo / Redo ---------- */

const UNDO_BASE: Record<string, string> = {
  create_task: "/tasks",
  create_expense: "/expenses",
  create_medication: "/medications",
  create_routine_template: "/routines",
  create_wish: "/wishes",
  log_entry: "/logs",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// sleep, weight and mood overwrite that day's entry (id = "<date>-<type>"), so deleting one
// would also delete whatever was there before.
const OVERWRITING_LOG_TITLES = new Set(["Sleep", "Weight", "Mood"]);

// The DELETE path for a card's own result, or null when there's no safe Undo. It only ever
// uses the id that came back in this card's result — never a lookup, never the model's input.
export function undoPath(entry: ToolResultEntry): string | null {
  const base = UNDO_BASE[entry.name];
  const id = entry.result.id;
  if (!base || !id || entry.result.deleted) return null;
  if (!/^[A-Za-z0-9-]+$/.test(id)) return null;
  if (entry.name === "log_entry") {
    if (!UUID.test(id) || OVERWRITING_LOG_TITLES.has(entry.result.title)) return null;
  }
  return `${base}/${id}`;
}

const REMOVED_LABEL: Record<string, string> = {
  create_task: "Task removed",
  create_expense: "Expense removed",
  create_medication: "Medication removed",
  create_routine_template: "Routine removed",
  create_wish: "Wish removed",
  log_entry: "Log entry removed",
};

export function removedLabel(name: string): string {
  return REMOVED_LABEL[name] ?? "Removed";
}

export interface RedoRequest {
  path: string;
  body: Record<string, unknown>;
  // The field of the create response that holds the new item's id.
  idField: string;
}

// Redo recreates the item from its own result, so it exists only where the result holds
// everything the create needs. An expense does. A task's result has no description, repeat
// schedule or category, so redoing one would quietly lose them: no Redo for tasks (or anything
// else) until the backend result carries the full item.
export function redoRequest(entry: ToolResultEntry): RedoRequest | null {
  if (entry.name !== "create_expense") return null;
  const category = entry.result.title.toLowerCase();
  const amount = Number(entry.result.fields?.amount);
  const date = entry.result.fields?.date;
  if (!(EXPENSE_CATEGORIES as string[]).includes(category) || !Number.isFinite(amount) || amount < 0) return null;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const note = entry.result.fields?.note;
  return { path: "/expenses", body: { category, amount, date, ...(note ? { note } : {}) }, idField: "expenseId" };
}

/* ---------- failures ---------- */

const FAILURE_VERB: Record<string, string> = { create: "add", log: "log", update: "update", set: "set", delete: "delete" };

// Fixed text, built from the tool name only — the model's own sentence goes beneath it.
export function failureHeadline(name: string): string {
  if (name === "log_entry") return "Couldn't save the log entry";
  const [verb, ...rest] = name.split("_");
  const subject = rest.join(" ") || "request";
  return `Couldn't ${FAILURE_VERB[verb] ?? "finish"} the ${subject}`;
}

export const TIMEOUT_REASON = "The assistant stopped before finishing.";

/* ---------- quiet notes ---------- */

export const DELETE_NOTE = "Delete request sent";

export function quietLabel(name: string): string | null {
  const [verb, ...rest] = name.split("_");
  const subject = rest.join(" ");
  if (verb === "get" && subject) return `Checked ${subject}`;
  if (verb === "search" && subject) return `Searched ${subject}`;
  if (name === "remember_fact") return "Saved to memory";
  if (name === "update_memory") return "Updated memory";
  if (name === "forget_fact") return "Removed from memory";
  if (name === "update_profile") return "Updated profile";
  return null;
}

/* ---------- following one reply's tool calls ---------- */

export type StreamOutcome = "done" | "error" | "ended";

// Feeds on a reply's stream events and works out, at the end, which tool calls never returned
// a result. A rejected call looks like: a `tool_use` with no `result`, then the reply, then
// `done` — there is no error event, so absence of a result is the only signal. A `tool_error`
// event, if the backend ever sends one, is taken as the exact answer instead.
export class ToolCallTracker {
  private pending: string[] = [];
  private explicit: ToolFailure[] = [];
  readonly quiet: string[] = [];

  hasPending(): boolean {
    return this.pending.length > 0;
  }

  // Returns the card entry to show, when the event carried a displayable result.
  handle(event: AssistantStreamEvent): ToolResultEntry | null {
    if (event.type === "tool_use") {
      if (!event.result) {
        if (SUMMARISED_TOOLS.has(event.name)) this.pending.push(event.name);
        else this.addQuiet(quietLabel(event.name));
        return null;
      }
      this.resolve(event.name);
      if (event.result.deleted) {
        this.addQuiet(DELETE_NOTE);
        return null;
      }
      return { name: event.name, result: event.result };
    }
    if (event.type === "tool_error") {
      this.resolve(event.name);
      this.explicit.push({ name: event.name, kind: "rejected", reason: event.message });
    }
    return null;
  }

  private resolve(name: string) {
    const i = this.pending.indexOf(name);
    if (i !== -1) this.pending.splice(i, 1);
  }

  private addQuiet(label: string | null) {
    if (label && !this.quiet.includes(label)) this.quiet.push(label);
  }

  // `resultCount` is how many cards succeeded in this reply. A lone failure with no successes
  // lets the assistant's own sentence serve as the reason.
  finish(outcome: StreamOutcome, errorMessage?: string, resultCount = 0): ToolFailure[] {
    const unresolved: ToolFailure[] = this.pending.map((name) => {
      if (outcome === "error") return { name, kind: "server", reason: errorMessage };
      if (outcome === "ended") return { name, kind: "timeout", reason: TIMEOUT_REASON };
      return { name, kind: "rejected" };
    });
    const all = [...this.explicit, ...unresolved];
    return all.map((f) =>
      f.kind === "rejected" && !f.reason && all.length === 1 && resultCount === 0 ? { ...f, useReply: true } : f,
    );
  }
}
