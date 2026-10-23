import { describe, expect, it } from "vitest";
import { toolEvents } from "./toolEvents";

describe("toolEvents", () => {
  it("adds a result event for a successful, summarisable call", () => {
    const events = toolEvents("delete_task", { taskId: "t1" }, { content: "{}", isError: false });
    expect(events).toEqual([{ type: "tool_use", name: "delete_task", result: expect.objectContaining({ deleted: true }) }]);
  });

  it("adds nothing for a successful call with nothing to summarise", () => {
    expect(toolEvents("get_tasks", {}, { content: "[]", isError: false })).toEqual([]);
  });

  it("adds exactly one tool_error, with no result, for a failed call", () => {
    const events = toolEvents(
      "log_medication",
      { medicationId: "missing" },
      { content: JSON.stringify({ error: "Medication not found" }), isError: true },
    );
    expect(events).toEqual([{ type: "tool_error", name: "log_medication", message: "Medication not found" }]);
  });

  it("never leaks raw error text into the tool_error message", () => {
    const events = toolEvents("create_task", {}, { content: "SyntaxError: Unexpected token <", isError: true });
    expect(events[0]).toMatchObject({ type: "tool_error", message: expect.not.stringContaining("SyntaxError") });
  });
});
