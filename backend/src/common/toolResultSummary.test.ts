import { describe, expect, it } from "vitest";
import { summarizeToolResult } from "./toolResultSummary";

describe("summarizeToolResult", () => {
  it("summarizes a created task with due date/time and priority", () => {
    const content = JSON.stringify({
      taskId: "t1",
      title: "Call plumber",
      dueDate: "2026-10-16",
      dueTime: "18:00",
      priority: "Medium",
    });
    expect(summarizeToolResult("create_task", {}, content)).toEqual({
      itemType: "task",
      id: "t1",
      title: "Call plumber",
      fields: { due: "2026-10-16 18:00", priority: "Medium" },
    });
  });

  it("omits fields that weren't set on a created task", () => {
    const content = JSON.stringify({ taskId: "t2", title: "Someday task" });
    expect(summarizeToolResult("create_task", {}, content)).toEqual({
      itemType: "task",
      id: "t2",
      title: "Someday task",
      fields: {},
    });
  });

  it("returns undefined when the expected title field is missing", () => {
    expect(summarizeToolResult("create_task", {}, JSON.stringify({ taskId: "t3" }))).toBeUndefined();
  });

  it("builds a delete summary from the tool's own input, not the (empty) response body", () => {
    expect(summarizeToolResult("delete_task", { taskId: "t4" }, "{}")).toEqual({
      itemType: "task",
      id: "t4",
      title: "Task",
      deleted: true,
    });
    expect(summarizeToolResult("delete_medication", { medicationId: "m1" }, JSON.stringify({ deleted: true }))).toEqual({
      itemType: "medication",
      id: "m1",
      title: "Medication",
      deleted: true,
    });
  });

  it("summarizes a created medication", () => {
    const content = JSON.stringify({ medicationId: "m2", name: "Vitamin D", dosage: "1000 IU", timeOfDay: "08:00" });
    expect(summarizeToolResult("create_medication", {}, content)).toEqual({
      itemType: "medication",
      id: "m2",
      title: "Vitamin D",
      fields: { dosage: "1000 IU", time: "08:00" },
    });
  });

  it("summarizes a weight log_entry with the type-specific field and never leaks unrelated data keys", () => {
    const content = JSON.stringify({
      logId: "l1",
      logType: "weight",
      date: "2026-10-16",
      data: { valueKg: 61.2 },
      aiExtracted: { secret: "should never appear" },
    });
    const summary = summarizeToolResult("log_entry", {}, content);
    expect(summary).toEqual({
      itemType: "log",
      id: "l1",
      title: "Weight",
      fields: { weight: "61.2 kg", date: "2026-10-16" },
    });
    expect(JSON.stringify(summary)).not.toContain("secret");
  });

  it("summarizes a mood log_entry", () => {
    const content = JSON.stringify({ logId: "l2", logType: "mood", date: "2026-10-16", data: { rating: 4 } });
    expect(summarizeToolResult("log_entry", {}, content)).toEqual({
      itemType: "log",
      id: "l2",
      title: "Mood",
      fields: { rating: "4/5", date: "2026-10-16" },
    });
  });

  it("summarizes a created expense", () => {
    const content = JSON.stringify({ expenseId: "e1", category: "food", amount: 18.5, date: "2026-10-16" });
    expect(summarizeToolResult("create_expense", {}, content)).toEqual({
      itemType: "expense",
      id: "e1",
      title: "Food",
      fields: { amount: "18.5", date: "2026-10-16" },
    });
  });

  it("returns undefined for an expense missing an amount", () => {
    expect(
      summarizeToolResult("create_expense", {}, JSON.stringify({ expenseId: "e2", category: "food" })),
    ).toBeUndefined();
  });

  it("summarizes a meal-plan batch with a failed count", () => {
    const content = JSON.stringify({ set: 3, failed: [{ date: "2026-10-17", mealType: "lunch" }] });
    expect(summarizeToolResult("set_meal_plan_batch", {}, content)).toEqual({
      itemType: "mealPlanBatch",
      title: "3 meals planned",
      fields: { failed: "1" },
    });
  });

  it("returns undefined for plain-string memory tool results", () => {
    expect(summarizeToolResult("remember_fact", {}, "Remembered.")).toBeUndefined();
    expect(summarizeToolResult("forget_fact", {}, "Forgotten.")).toBeUndefined();
  });

  it("returns undefined for read-only and unmapped tools", () => {
    expect(summarizeToolResult("get_tasks", {}, JSON.stringify({ tasks: [] }))).toBeUndefined();
    expect(summarizeToolResult("update_profile", {}, JSON.stringify({ userId: "u1" }))).toBeUndefined();
    expect(summarizeToolResult("some_future_tool", {}, JSON.stringify({ anything: true }))).toBeUndefined();
  });

  it("returns undefined for malformed JSON content instead of throwing", () => {
    expect(summarizeToolResult("create_task", {}, "not json")).toBeUndefined();
  });
});
