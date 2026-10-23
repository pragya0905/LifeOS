import { describe, it, expect } from "vitest";
import { toChatMessages } from "./chatHistory";
import {
  DELETE_NOTE,
  SUMMARISED_TOOLS,
  TIMEOUT_REASON,
  ToolCallTracker,
  failureHeadline,
  friendlyWhen,
  pageForTool,
  presentCard,
  redoRequest,
  removedLabel,
  undoPath,
  type ToolResultEntry,
} from "./toolCards";
import type { AssistantStreamEvent } from "../hooks/useAssistantStream";

const UUID = "99cac2aa-04db-47dc-9f0a-97a8469bdaf8";
const entry = (name: string, result: ToolResultEntry["result"]): ToolResultEntry => ({ name, result });

const running = (name: string): AssistantStreamEvent => ({ type: "tool_use", name });
const finished = (name: string, result: ToolResultEntry["result"]): AssistantStreamEvent => ({ type: "tool_use", name, result });

describe("undoPath", () => {
  it("uses the card's own result id for each undoable create", () => {
    expect(undoPath(entry("create_task", { itemType: "task", id: UUID, title: "Call" }))).toBe(`/tasks/${UUID}`);
    expect(undoPath(entry("create_expense", { itemType: "expense", id: UUID, title: "Groceries" }))).toBe(`/expenses/${UUID}`);
    expect(undoPath(entry("create_medication", { itemType: "medication", id: UUID, title: "Aspirin" }))).toBe(`/medications/${UUID}`);
    expect(undoPath(entry("create_routine_template", { itemType: "routine", id: UUID, title: "Morning" }))).toBe(`/routines/${UUID}`);
    expect(undoPath(entry("create_wish", { itemType: "wish", id: UUID, title: "Trip" }))).toBe(`/wishes/${UUID}`);
  });

  it("allows Undo for log entries that get a fresh id (food, call, cycle, body fat)", () => {
    for (const title of ["Food", "Call", "Cycle", "Body fat"]) {
      expect(undoPath(entry("log_entry", { itemType: "log", id: UUID, title }))).toBe(`/logs/${UUID}`);
    }
  });

  it("never shows Undo for sleep, weight or mood, which overwrite that day's entry", () => {
    for (const [title, id] of [["Sleep", "2026-10-23-sleep"], ["Weight", "2026-10-23-weight"], ["Mood", "2026-10-23-mood"]]) {
      expect(undoPath(entry("log_entry", { itemType: "log", id, title }))).toBeNull();
    }
    // Even with a UUID-shaped id, the type alone rules it out.
    for (const title of ["Sleep", "Weight", "Mood"]) {
      expect(undoPath(entry("log_entry", { itemType: "log", id: UUID, title }))).toBeNull();
    }
  });

  it("has no Undo for updates, status logs, overwrites, journal or deletes", () => {
    const none = [
      "update_log_entry", "update_medication", "update_routine_template", "update_expense",
      "log_habit", "log_medication", "log_routine_step", "set_budget", "set_goal",
      "set_meal_plan", "set_meal_plan_template", "set_meal_plan_batch", "log_journal_entry",
      "delete_task", "delete_expense",
    ];
    for (const name of none) {
      expect(undoPath(entry(name, { itemType: "x", id: UUID, title: "t" }))).toBeNull();
    }
  });

  it("needs the result's own id, and refuses a deleted result or an unsafe id", () => {
    expect(undoPath(entry("create_task", { itemType: "task", title: "No id" }))).toBeNull();
    expect(undoPath(entry("create_task", { itemType: "task", id: UUID, title: "t", deleted: true }))).toBeNull();
    expect(undoPath(entry("create_task", { itemType: "task", id: "../accounts", title: "t" }))).toBeNull();
    expect(undoPath(entry("create_task", { itemType: "task", id: "a/b", title: "t" }))).toBeNull();
  });
});

describe("redoRequest", () => {
  it("rebuilds an expense from its own result", () => {
    const r = redoRequest(entry("create_expense", { itemType: "expense", id: UUID, title: "Groceries", fields: { amount: "450", date: "2026-10-23" } }));
    expect(r).toEqual({ path: "/expenses", body: { category: "groceries", amount: 450, date: "2026-10-23" }, idField: "expenseId" });
  });

  it("carries the note when there is one", () => {
    const r = redoRequest(entry("create_expense", { itemType: "expense", title: "Groceries", fields: { amount: "450", date: "2026-10-23", note: "milk" } }));
    expect(r?.body.note).toBe("milk");
  });

  it("offers no Redo for a task, whose result can't recreate it fully", () => {
    expect(redoRequest(entry("create_task", { itemType: "task", id: UUID, title: "Call", fields: { due: "2026-10-23 18:00" } }))).toBeNull();
  });

  it("offers none when the expense result is incomplete or unrecognised", () => {
    expect(redoRequest(entry("create_expense", { itemType: "expense", title: "Groceries", fields: { amount: "450" } }))).toBeNull();
    expect(redoRequest(entry("create_expense", { itemType: "expense", title: "Nonsense", fields: { amount: "5", date: "2026-10-23" } }))).toBeNull();
    expect(redoRequest(entry("create_expense", { itemType: "expense", title: "Groceries", fields: { amount: "-5", date: "2026-10-23" } }))).toBeNull();
  });
});

describe("removedLabel", () => {
  it("words the removal by item type", () => {
    expect(removedLabel("create_task")).toBe("Task removed");
    expect(removedLabel("create_expense")).toBe("Expense removed");
    expect(removedLabel("create_medication")).toBe("Medication removed");
    expect(removedLabel("create_routine_template")).toBe("Routine removed");
    expect(removedLabel("create_wish")).toBe("Wish removed");
    expect(removedLabel("log_entry")).toBe("Log entry removed");
  });
});

describe("presentCard", () => {
  it("shows a task with a friendly due time and a priority", () => {
    const p = presentCard(entry("create_task", { itemType: "task", id: UUID, title: "Call the plumber", fields: { due: "2026-10-23 18:00", priority: "Medium" } }), "2026-10-23");
    expect(p).toMatchObject({ visual: "task", title: "Call the plumber", verb: "Added" });
    expect(p?.meta).toEqual([{ text: "Today 18:00" }, { text: "Medium", priority: "Medium" }]);
  });

  it("words the verb by the tool", () => {
    expect(presentCard(entry("log_habit", { itemType: "habit", title: "Water", fields: { value: "500 ml" } }))?.verb).toBe("Logged");
    expect(presentCard(entry("update_medication", { itemType: "medication", title: "Aspirin" }))?.verb).toBe("Updated");
    expect(presentCard(entry("create_expense", { itemType: "expense", title: "Groceries" }))?.verb).toBe("Logged");
    expect(presentCard(entry("create_task", { itemType: "task", title: "Call" }))?.verb).toBe("Added");
  });

  it("returns no card for a delete", () => {
    expect(presentCard(entry("delete_task", { itemType: "task", id: "x", title: "Task", deleted: true }))).toBeNull();
  });

  it("formats dates", () => {
    expect(friendlyWhen("2026-10-24", "2026-10-23")).toBe("Tomorrow");
    expect(friendlyWhen("2026-10-22", "2026-10-23")).toBe("Yesterday");
    expect(friendlyWhen("not a date")).toBe("not a date");
  });
});

describe("pageForTool and failureHeadline", () => {
  it("links to the list page for the item", () => {
    expect(pageForTool("create_task")).toEqual({ label: "Tasks", path: "/tasks" });
    expect(pageForTool("create_expense").path).toBe("/budget");
    expect(pageForTool("log_medication").path).toBe("/medications");
    expect(pageForTool("log_routine_step").path).toBe("/routines");
    expect(pageForTool("log_habit").path).toBe("/dashboard");
  });

  it("builds a fixed headline from the tool name", () => {
    expect(failureHeadline("create_task")).toBe("Couldn't add the task");
    expect(failureHeadline("create_expense")).toBe("Couldn't add the expense");
    expect(failureHeadline("log_medication")).toBe("Couldn't log the medication");
    expect(failureHeadline("log_entry")).toBe("Couldn't save the log entry");
    expect(failureHeadline("update_log_entry")).toBe("Couldn't update the log entry");
    expect(failureHeadline("update_routine_template")).toBe("Couldn't update the routine template");
  });
});

describe("ToolCallTracker", () => {
  it("makes a card from a result and sees no failure", () => {
    const t = new ToolCallTracker();
    expect(t.handle(running("create_task"))).toBeNull();
    const card = t.handle(finished("create_task", { itemType: "task", id: UUID, title: "Call" }));
    expect(card?.name).toBe("create_task");
    expect(t.finish("done", undefined, 1)).toEqual([]);
  });

  it("treats a started tool with no result, then done, as a rejected call", () => {
    const t = new ToolCallTracker();
    t.handle(running("create_expense"));
    expect(t.finish("done")).toEqual([{ name: "create_expense", kind: "rejected", useReply: true }]);
  });

  it("does not let the reply stand in for the reason when other cards succeeded", () => {
    const t = new ToolCallTracker();
    t.handle(running("log_habit"));
    t.handle(finished("log_habit", { itemType: "habit", id: "x", title: "Water" }));
    t.handle(running("create_task"));
    expect(t.finish("done", undefined, 1)).toEqual([{ name: "create_task", kind: "rejected" }]);
  });

  it("marks an unresolved tool as a server failure when an error event ends the stream", () => {
    const t = new ToolCallTracker();
    t.handle(running("create_task"));
    expect(t.finish("error", "Something went wrong. Please try again.")).toEqual([
      { name: "create_task", kind: "server", reason: "Something went wrong. Please try again." },
    ]);
  });

  it("marks an unresolved tool as a timeout when the stream just ends", () => {
    const t = new ToolCallTracker();
    t.handle(running("create_task"));
    expect(t.finish("ended")).toEqual([{ name: "create_task", kind: "timeout", reason: TIMEOUT_REASON }]);
  });

  it("never calls a read tool a failure, and notes it quietly", () => {
    const t = new ToolCallTracker();
    t.handle(running("get_tasks"));
    expect(t.finish("done")).toEqual([]);
    expect(t.quiet).toEqual(["Checked tasks"]);
  });

  it("turns a delete result into the quiet note, never a card", () => {
    const t = new ToolCallTracker();
    t.handle(running("delete_task"));
    expect(t.handle(finished("delete_task", { itemType: "task", id: "does-not-exist-123", title: "Task", deleted: true }))).toBeNull();
    expect(t.quiet).toEqual([DELETE_NOTE]);
    expect(t.finish("done")).toEqual([]);
  });

  it("accepts a tool_error event as the exact failure, with its message", () => {
    const t = new ToolCallTracker();
    t.handle(running("create_expense"));
    t.handle({ type: "tool_error", name: "create_expense", message: "amount must be a non-negative number" });
    expect(t.finish("done")).toEqual([{ name: "create_expense", kind: "rejected", reason: "amount must be a non-negative number" }]);
  });

  it("tracks two calls of the same tool separately", () => {
    const t = new ToolCallTracker();
    t.handle(running("create_task"));
    t.handle(running("create_task"));
    t.handle(finished("create_task", { itemType: "task", id: UUID, title: "A" }));
    expect(t.finish("done", undefined, 1)).toEqual([{ name: "create_task", kind: "rejected" }]);
  });
});

describe("summarised tool list", () => {
  // The 24 tools backend/src/common/toolResultSummary.ts has a case for. Hand-kept in sync, like
  // the other mirrored types: if the backend gains or loses one, this list must change with it.
  const BACKEND_SUMMARISED = [
    "create_task", "delete_task",
    "create_medication", "update_medication", "delete_medication",
    "create_routine_template", "update_routine_template", "delete_routine_template",
    "log_routine_step", "log_medication", "log_habit", "log_entry", "update_log_entry",
    "create_wish", "create_expense", "update_expense", "delete_expense",
    "set_budget", "set_goal",
    "set_meal_plan", "set_meal_plan_template", "set_meal_plan_batch", "set_meal_plan_template_batch",
    "log_journal_entry",
  ];

  it("matches exactly the 24 tools the backend summarises", () => {
    expect(BACKEND_SUMMARISED).toHaveLength(24);
    expect([...SUMMARISED_TOOLS].sort()).toEqual([...BACKEND_SUMMARISED].sort());
  });

  it("can infer a failure for every summarised tool, and for no other tool", () => {
    for (const name of BACKEND_SUMMARISED) {
      const t = new ToolCallTracker();
      t.handle(running(name));
      expect(t.finish("done"), name).toEqual([{ name, kind: "rejected", useReply: true }]);
    }
  });

  it("never shows a failure card for get_*, search_journal, memory or profile tools", () => {
    const NEVER_FAILURE = [
      "get_tasks", "get_expenses", "get_logs", "get_meal_plan", "get_meal_plan_template",
      "get_medications", "get_routines", "get_progress_summary", "get_schedule",
      "get_daily_checkin_status", "get_weather", "search_journal",
      "remember_fact", "update_memory", "forget_fact", "update_profile",
    ];
    for (const name of NEVER_FAILURE) {
      // Started, never resolved, and the stream ended in every way it can.
      for (const outcome of ["done", "error", "ended"] as const) {
        const t = new ToolCallTracker();
        t.handle(running(name));
        expect(t.finish(outcome, "boom"), `${name} ${outcome}`).toEqual([]);
      }
    }
  });

  it("gives get_* and search_journal a quiet note and memory tools none, never a card", () => {
    const t = new ToolCallTracker();
    t.handle(running("get_tasks"));
    t.handle(running("search_journal"));
    t.handle(running("remember_fact"));
    t.handle(running("update_profile"));
    t.finish("done");
    expect(t.quiet).toEqual(["Checked tasks", "Searched journal", "Saved to memory", "Updated profile"]);
  });
});

describe("reopening a conversation from history", () => {
  it("brings back text and attachment names only, never cards", () => {
    const messages = toChatMessages([
      { role: "user", content: "Add a task\n\n[Attached a.png, b.pdf]" },
      { role: "assistant", content: "Done — task added." },
    ]);
    expect(messages[0]).toEqual({ role: "user", content: "Add a task", attachmentNames: ["a.png", "b.pdf"] });
    expect(messages[1]).toEqual({ role: "assistant", content: "Done — task added." });
    for (const m of messages) {
      expect(m.toolResults).toBeUndefined();
      expect(m.toolFailures).toBeUndefined();
      expect(m.quietNotes).toBeUndefined();
    }
  });
});
