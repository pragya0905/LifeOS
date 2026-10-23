import { describe, expect, it } from "vitest";
import { createTaskBody, routineTimeOfDay } from "./taskBody";

describe("createTaskBody", () => {
  it("is unchanged when no priority is given: the app suggests one", () => {
    const body = createTaskBody({ title: "Buy milk", description: "2 litres", dueDate: "2026-10-25", dueTime: "18:00", recurrence: undefined });
    expect(JSON.stringify(body)).toBe(
      JSON.stringify({ title: "Buy milk", description: "2 litres", dueDate: "2026-10-25", dueTime: "18:00", recurrence: undefined, suggestPriority: true }),
    );
    expect(body).not.toHaveProperty("priority");
  });

  it("sends a valid priority and omits suggestPriority, so no model call is made", () => {
    const body = createTaskBody({ title: "Renew passport", priority: "High" });
    expect(body.priority).toBe("High");
    expect(body).not.toHaveProperty("suggestPriority");
  });

  it("drops an invalid priority and falls back to the suggestion", () => {
    const body = createTaskBody({ title: "x", priority: "urgent" });
    expect(body).not.toHaveProperty("priority");
    expect(body.suggestPriority).toBe(true);
  });

  it("forwards estimatedHours and a trimmed category when valid", () => {
    const body = createTaskBody({ title: "x", estimatedHours: 2, category: "  work  " });
    expect(body.estimatedHours).toBe(2);
    expect(body.category).toBe("work");
  });

  it("omits estimatedHours and category when invalid", () => {
    const body = createTaskBody({ title: "x", estimatedHours: 0, category: "a".repeat(41) });
    expect(body).not.toHaveProperty("estimatedHours");
    expect(body).not.toHaveProperty("category");
  });
});

describe("routineTimeOfDay", () => {
  it("passes a valid HH:MM through", () => {
    expect(routineTimeOfDay("07:00")).toBe("07:00");
  });

  it("drops anything that is not HH:MM", () => {
    expect(routineTimeOfDay("7am")).toBeUndefined();
    expect(routineTimeOfDay("7:00")).toBeUndefined();
    expect(routineTimeOfDay(700)).toBeUndefined();
    expect(routineTimeOfDay(undefined)).toBeUndefined();
  });
});
