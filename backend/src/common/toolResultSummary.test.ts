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
      item: { title: "Call plumber", dueDate: "2026-10-16", dueTime: "18:00", priority: "Medium" },
    });
  });

  it("omits fields that weren't set on a created task", () => {
    const content = JSON.stringify({ taskId: "t2", title: "Someday task" });
    expect(summarizeToolResult("create_task", {}, content)).toEqual({
      itemType: "task",
      id: "t2",
      title: "Someday task",
      fields: {},
      item: { title: "Someday task" },
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
      item: { name: "Vitamin D", dosage: "1000 IU", timeOfDay: "08:00" },
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

describe("summarizeToolResult names in log results", () => {
  it("titles a routine step log with the step's own text", () => {
    const content = JSON.stringify({ dateRoutineStep: "2026-10-23#r1#1", status: "done", stepName: "Toner" });
    expect(summarizeToolResult("log_routine_step", {}, content)).toMatchObject({ title: "Toner" });
  });

  it("falls back to a generic routine step title when no name is returned", () => {
    const content = JSON.stringify({ dateRoutineStep: "2026-10-23#r1#1", status: "done" });
    expect(summarizeToolResult("log_routine_step", {}, content)).toMatchObject({ title: "Routine step" });
  });

  it("titles a medication log with the medication's own name", () => {
    const content = JSON.stringify({ dateMedicationId: "2026-10-23#m1", status: "taken", medicationName: "Vitamin D" });
    expect(summarizeToolResult("log_medication", {}, content)).toMatchObject({ title: "Vitamin D" });
  });

  it("falls back to a generic medication title when no name is returned", () => {
    const content = JSON.stringify({ dateMedicationId: "2026-10-23#m1", status: "taken" });
    expect(summarizeToolResult("log_medication", {}, content)).toMatchObject({ title: "Medication" });
  });
});

describe("whole-item results for create tools (Redo)", () => {
  it("keeps only the allowlisted writable task fields, never internal ones", () => {
    const content = JSON.stringify({
      taskId: "t9",
      userId: "user-1",
      title: "Renew passport",
      description: "bring photos",
      category: "admin",
      priority: "High",
      prioritySource: "manual",
      estimatedHours: 2,
      recurrence: { frequency: "weekly", daysOfWeek: [1, 3], extra: "drop me" },
      reminderSentAt: "2026-10-01T00:00:00Z",
      createdAt: "2026-10-01T00:00:00Z",
    });
    const result = summarizeToolResult("create_task", {}, content);
    expect(result?.item).toEqual({
      title: "Renew passport",
      description: "bring photos",
      category: "admin",
      priority: "High",
      estimatedHours: 2,
      recurrence: { frequency: "weekly", daysOfWeek: [1, 3] },
    });
    expect(JSON.stringify(result?.item)).not.toMatch(/user-1|reminderSentAt|createdAt|prioritySource/);
  });

  it("omits item rather than truncating when a string is over 500 characters", () => {
    const content = JSON.stringify({ taskId: "t10", title: "x", description: "a".repeat(501) });
    const result = summarizeToolResult("create_task", {}, content);
    expect(result).toBeDefined();
    expect(result).not.toHaveProperty("item");
  });

  it("omits item when a routine has more than 30 steps", () => {
    const content = JSON.stringify({
      routineId: "r9",
      name: "Long",
      category: "dailyRoutine",
      steps: Array.from({ length: 31 }, (_, i) => `step ${i}`),
    });
    expect(summarizeToolResult("create_routine_template", {}, content)).not.toHaveProperty("item");
  });

  it("keeps a routine's steps, schedule and time when within limits", () => {
    const content = JSON.stringify({
      routineId: "r10",
      name: "Skin",
      category: "skinCare",
      steps: ["Cleanser", "Toner"],
      daysOfWeek: [0, 6],
      timeOfDay: "07:00",
      estimatedMinutes: 5,
      createdAt: "2026-10-01T00:00:00Z",
    });
    expect(summarizeToolResult("create_routine_template", {}, content)?.item).toEqual({
      category: "skinCare",
      name: "Skin",
      steps: ["Cleanser", "Toner"],
      daysOfWeek: [0, 6],
      timeOfDay: "07:00",
      estimatedMinutes: 5,
    });
  });

  it("keeps a medication's dosage and notes for Redo, and does not expose a userId", () => {
    const content = JSON.stringify({
      medicationId: "m7",
      userId: "user-1",
      name: "Iron",
      dosage: "65 mg",
      notes: "take with food",
      startDate: "2026-10-23",
      durationDays: 30,
      timezoneOffsetMinutes: -330,
      endDate: "2026-11-21",
    });
    const result = summarizeToolResult("create_medication", {}, content);
    expect(result?.item).toEqual({
      name: "Iron",
      dosage: "65 mg",
      notes: "take with food",
      startDate: "2026-10-23",
      durationDays: 30,
      timezoneOffsetMinutes: -330,
    });
  });

  it("keeps a wish's type, mode and targets for Redo", () => {
    const content = JSON.stringify({
      wishId: "w1",
      title: "Read 12 books",
      type: "learning",
      progressMode: "quantity",
      quantityTarget: 12,
      quantityUnit: "books",
      imageKeys: ["a.jpg"],
    });
    expect(summarizeToolResult("create_wish", {}, content)?.item).toEqual({
      title: "Read 12 books",
      type: "learning",
      progressMode: "quantity",
      quantityTarget: 12,
      quantityUnit: "books",
    });
  });

  it("never adds an item to an update, only to a create", () => {
    const content = JSON.stringify({ medicationId: "m1", name: "Iron" });
    expect(summarizeToolResult("update_medication", {}, content)).not.toHaveProperty("item");
  });
});
