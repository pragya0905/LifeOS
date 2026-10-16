// Turns a tool's raw JSON result (already computed in chatAssistant/index.ts's executeTool)
// into a small, display-ready summary safe to stream to the frontend for a confirmation card.
// Deliberately an allowlist, never a passthrough: several tools' raw results carry fields that
// must never reach the client as-is (log_journal_entry's response includes aiExtracted/
// dayReview and an unstripped embedding vector) — picking fields explicitly means nothing
// unlisted here can ever leak, by construction, not by remembering to strip it each time.
// Returns undefined whenever there's nothing safe/meaningful to summarize (a get_* read, a
// plain-string memory-tool result, or a response missing the field this summary needs) — the
// frontend falls back to its existing generic status line in that case.

export interface ToolResultSummary {
  itemType: string;
  id?: string;
  title: string;
  fields?: Record<string, string>;
  deleted?: boolean;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

const LOG_TYPE_LABEL: Record<string, string> = {
  food: "Food",
  sleep: "Sleep",
  weight: "Weight",
  bodyFat: "Body fat",
  mood: "Mood",
  call: "Call",
  cycle: "Cycle",
};

const MEAL_TYPE_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

function numStr(v: unknown): string | undefined {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : undefined;
}

// `input` is the tool call's own arguments (from the model) — needed for delete tools, whose
// HTTP responses are either `{deleted:true}` or an empty 204 body, neither of which echoes
// back the id or a title; the id the model itself passed in is the only thing available.
export function summarizeToolResult(
  name: string,
  input: Record<string, unknown>,
  content: string,
): ToolResultSummary | undefined {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    // The three memory tools (remember_fact/update_memory/forget_fact) return plain strings
    // ("Remembered.", "Updated.", …), not JSON — nothing structured to summarize.
    return undefined;
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) return undefined;
  const d = data as Record<string, unknown>;

  switch (name) {
    case "create_task": {
      const title = str(d.title);
      if (!title) return undefined;
      const fields: Record<string, string> = {};
      if (str(d.dueDate)) fields.due = `${d.dueDate}${str(d.dueTime) ? ` ${d.dueTime}` : ""}`;
      if (str(d.priority)) fields.priority = d.priority as string;
      return { itemType: "task", id: str(d.taskId), title, fields };
    }
    case "delete_task":
      return { itemType: "task", id: str(input.taskId), title: "Task", deleted: true };

    case "create_medication":
    case "update_medication": {
      const title = str(d.name);
      if (!title) return undefined;
      const fields: Record<string, string> = {};
      if (str(d.dosage)) fields.dosage = d.dosage as string;
      if (str(d.timeOfDay)) fields.time = d.timeOfDay as string;
      return { itemType: "medication", id: str(d.medicationId), title, fields };
    }
    case "delete_medication":
      return { itemType: "medication", id: str(input.medicationId), title: "Medication", deleted: true };

    case "create_routine_template":
    case "update_routine_template": {
      const title = str(d.name);
      if (!title) return undefined;
      const fields: Record<string, string> = {};
      if (Array.isArray(d.steps)) fields.steps = `${d.steps.length} step${d.steps.length === 1 ? "" : "s"}`;
      if (str(d.timeOfDay)) fields.time = d.timeOfDay as string;
      return { itemType: "routine", id: str(d.routineId), title, fields };
    }
    case "delete_routine_template":
      return { itemType: "routine", id: str(input.routineId), title: "Routine", deleted: true };

    case "log_routine_step": {
      const status = str(d.status);
      if (!status) return undefined;
      return {
        itemType: "routineStep",
        id: str(d.dateRoutineStep),
        title: "Routine step",
        fields: { status: capitalize(status.replace("_", " ")) },
      };
    }

    case "log_medication": {
      const status = str(d.status);
      if (!status) return undefined;
      return {
        itemType: "medicationLog",
        id: str(d.dateMedicationId),
        title: "Medication",
        fields: { status: capitalize(status) },
      };
    }

    case "log_habit": {
      const habitType = str(d.habitType);
      if (!habitType) return undefined;
      const fields: Record<string, string> = {};
      const value = numStr(d.value);
      if (value) fields.value = str(d.unit) ? `${value} ${d.unit}` : value;
      return { itemType: "habit", id: str(d.dateHabitType), title: capitalize(habitType), fields };
    }

    case "log_entry":
    case "update_log_entry": {
      const logType = str(d.logType);
      if (!logType) return undefined;
      const logData = (d.data && typeof d.data === "object" ? d.data : {}) as Record<string, unknown>;
      const fields: Record<string, string> = {};
      switch (logType) {
        case "weight": {
          const v = numStr(logData.valueKg);
          if (v) fields.weight = `${v} kg`;
          break;
        }
        case "bodyFat": {
          const v = numStr(logData.percentage);
          if (v) fields.bodyFat = `${v}%`;
          break;
        }
        case "mood": {
          const v = numStr(logData.rating);
          if (v) fields.rating = `${v}/5`;
          break;
        }
        case "sleep":
          if (str(logData.bedTime) || str(logData.wakeTime)) {
            fields.sleep = `${str(logData.bedTime) ?? "?"} – ${str(logData.wakeTime) ?? "?"}`;
          }
          break;
        case "call":
          if (str(logData.personName)) fields.with = logData.personName as string;
          break;
        case "cycle":
          if (str(logData.event)) fields.event = (logData.event as string).replace(/_/g, " ");
          break;
        case "food":
          if (str(logData.description)) fields.meal = logData.description as string;
          break;
      }
      if (str(d.date)) fields.date = d.date as string;
      return { itemType: "log", id: str(d.logId), title: LOG_TYPE_LABEL[logType] ?? capitalize(logType), fields };
    }

    case "create_wish": {
      const title = str(d.title);
      if (!title) return undefined;
      const fields: Record<string, string> = {};
      if (str(d.type)) fields.type = d.type as string;
      if (str(d.targetDate)) fields.target = d.targetDate as string;
      return { itemType: "wish", id: str(d.wishId), title, fields };
    }

    case "create_expense":
    case "update_expense": {
      const category = str(d.category);
      const amount = numStr(d.amount);
      if (!category || !amount) return undefined;
      const fields: Record<string, string> = { amount };
      if (str(d.date)) fields.date = d.date as string;
      if (str(d.note)) fields.note = d.note as string;
      return { itemType: "expense", id: str(d.expenseId), title: capitalize(category), fields };
    }
    case "delete_expense":
      return { itemType: "expense", id: str(input.expenseId), title: "Expense", deleted: true };

    case "set_budget": {
      const category = str(d.category);
      const limit = numStr(d.monthlyLimit);
      if (!category || !limit) return undefined;
      return { itemType: "budget", id: category, title: capitalize(category), fields: { limit } };
    }

    case "set_goal": {
      const metric = str(d.metric);
      const target = numStr(d.targetValue);
      if (!metric || !target) return undefined;
      return { itemType: "goal", id: metric, title: capitalize(metric), fields: { target } };
    }

    case "set_meal_plan": {
      const mealType = str(d.mealType);
      if (!mealType) return undefined;
      const fields: Record<string, string> = {};
      if (str(d.date)) fields.date = d.date as string;
      if (str(d.text)) fields.plan = d.text as string;
      return {
        itemType: "mealPlanSlot",
        id: str(d.dateMealType),
        title: MEAL_TYPE_LABEL[mealType] ?? capitalize(mealType),
        fields,
      };
    }
    case "set_meal_plan_template": {
      const mealType = str(d.mealType);
      if (!mealType) return undefined;
      const fields: Record<string, string> = {};
      if (str(d.text)) fields.plan = d.text as string;
      return {
        itemType: "mealPlanTemplate",
        id: str(d.dayMealType),
        title: MEAL_TYPE_LABEL[mealType] ?? capitalize(mealType),
        fields,
      };
    }
    case "set_meal_plan_batch":
    case "set_meal_plan_template_batch": {
      if (typeof d.set !== "number") return undefined;
      const failed = Array.isArray(d.failed) ? d.failed.length : 0;
      return {
        itemType: "mealPlanBatch",
        title: `${d.set} meal${d.set === 1 ? "" : "s"} planned`,
        fields: failed > 0 ? { failed: String(failed) } : undefined,
      };
    }

    case "log_journal_entry": {
      const date = str(d.date);
      if (!date) return undefined;
      return { itemType: "journal", id: date, title: "Journal entry", fields: { date } };
    }

    // Every read-only get_* tool, search_journal, update_profile, and the memory tools
    // (which never reach here — see the JSON.parse catch above) intentionally have no case:
    // nothing was "created or changed" in the sense Part 3 cares about, so the frontend's
    // existing generic status line is the right fallback.
    default:
      return undefined;
  }
}
