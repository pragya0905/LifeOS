import type { APIGatewayProxyEventV2 } from "aws-lambda";
import Anthropic from "@anthropic-ai/sdk";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { ddb } from "../../common/dynamo";
import { verifyIdToken } from "../../common/jwtVerify";
import { EXPENSE_CATEGORIES } from "../../common/expenseCategories";
import type {
  AssistantConversationTurn,
  Budget,
  Expense,
  Goal,
  HabitLog,
  HabitType,
  MemoryCategory,
  UserMemory,
  Wish,
} from "../../common/types";

// This function runs behind a Lambda Function URL, not the shared HttpApi — response
// streaming (needed for token-by-token replies) requires bypassing API Gateway's buffered
// proxy integration entirely. Since it's no longer an HttpApi event source, referencing the
// HttpApi's own URL here is no longer circular the way it would be for an HttpApi route.
const API_URL = process.env.HTTP_API_URL as string;

// The `awslambda` global is injected by Lambda's Node.js runtime for response-streaming
// functions — no import exists for it. Ambient-declared here since @types/aws-lambda doesn't
// cover it. See https://docs.aws.amazon.com/lambda/latest/dg/config-rs-write-functions.html
declare const awslambda: {
  streamifyResponse(
    handler: (
      event: APIGatewayProxyEventV2,
      responseStream: NodeJS.WritableStream,
      context: unknown,
    ) => Promise<void>,
  ): unknown;
  HttpResponseStream: {
    from(
      responseStream: NodeJS.WritableStream,
      metadata: { statusCode: number; headers?: Record<string, string> },
    ): NodeJS.WritableStream;
  };
};

function writeEvent(stream: NodeJS.WritableStream, event: Record<string, unknown>): void {
  stream.write(`${JSON.stringify(event)}\n`);
}

const MAX_TOOL_ITERATIONS = 5;
const HISTORY_TURN_LIMIT = 40; // ~20 exchanges of conversational context

const s3 = new S3Client({});
const ATTACHMENT_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

interface AssistantAttachment {
  key: string;
  contentType: string;
  fileName: string;
}

function parseAttachment(body: Record<string, unknown>): AssistantAttachment | undefined {
  const raw = body.attachment;
  if (!raw || typeof raw !== "object") return undefined;
  const { key, contentType, fileName } = raw as Record<string, unknown>;
  if (typeof key !== "string" || typeof contentType !== "string" || typeof fileName !== "string") {
    return undefined;
  }
  if (!ATTACHMENT_CONTENT_TYPES.includes(contentType)) return undefined;
  return { key, contentType, fileName };
}

// Fetches the just-uploaded file from AssistantAttachmentsBucket and turns it into the
// content block Claude expects, confirmed against the current Anthropic docs (not guessed):
// image/* -> an "image" block, application/pdf -> a "document" block, both base64-encoded.
async function buildAttachmentBlock(
  userId: string,
  attachment: AssistantAttachment,
): Promise<Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam> {
  if (!attachment.key.startsWith(`${userId}/`)) {
    throw new Error("Attachment key does not belong to this user");
  }
  const obj = await s3.send(
    new GetObjectCommand({ Bucket: process.env.ASSISTANT_ATTACHMENTS_BUCKET_NAME, Key: attachment.key }),
  );
  const bytes = await obj.Body!.transformToByteArray();
  if (bytes.length > MAX_ATTACHMENT_BYTES) {
    throw new Error("Attachment is too large (max 15MB)");
  }
  const data = Buffer.from(bytes).toString("base64");
  if (attachment.contentType === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  }
  return {
    type: "image",
    source: { type: "base64", media_type: attachment.contentType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data },
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function callApi(
  apiUrl: string,
  authHeader: string,
  path: string,
  method: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${apiUrl}${path}`, {
    method,
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text().catch(() => "");
  const data = text ? JSON.parse(text) : undefined;
  return { status: res.status, data };
}

type WishWithProgress = Wish & { habitLinkedProgress: number | null };
const HABIT_TYPES: HabitType[] = ["water", "exercise", "steps"];

// Same progress-fraction logic wishReminderScheduler uses for its one-time push nudge,
// duplicated here (not imported) since that function computes it inline rather than
// exporting it — reused conceptually, not literally shared code.
function progressFractionForWish(wish: WishWithProgress): number | null {
  switch (wish.progressMode) {
    case "percentage":
      return wish.percentage !== undefined ? wish.percentage / 100 : null;
    case "milestone":
      if (!wish.milestones || wish.milestones.length === 0) return null;
      return wish.milestones.filter((m) => m.done).length / wish.milestones.length;
    case "quantity":
      if (!wish.quantityTarget) return null;
      return Math.min((wish.quantityCurrent ?? 0) / wish.quantityTarget, 1);
    case "habit_linked":
      return wish.habitLinkedProgress !== null ? wish.habitLinkedProgress / 100 : null;
    default:
      return null;
  }
}

// Best-effort, non-blocking context for the system prompt on every turn — separate from (and
// much cheaper than) the on-demand get_progress_summary tool below, so the assistant always
// knows what the user is working toward without paying for the full deterministic computation
// on every single message.
async function fetchGoalsContext(apiUrl: string, authHeader: string): Promise<string> {
  try {
    const [wishesRes, goalsRes, todayHabitsRes] = await Promise.all([
      callApi(apiUrl, authHeader, "/wishes", "GET"),
      callApi(apiUrl, authHeader, "/goals", "GET"),
      callApi(apiUrl, authHeader, `/habits/${today()}`, "GET"),
    ]);

    const wishes = (
      (wishesRes.data as { wishes: WishWithProgress[] } | undefined)?.wishes ?? []
    ).filter((w) => w.status === "active");
    const goals = (goalsRes.data as { goals: Goal[] } | undefined)?.goals ?? [];
    const todayHabits = (todayHabitsRes.data as { habits: HabitLog[] } | undefined)?.habits ?? [];

    const lines: string[] = [];
    if (wishes.length > 0) {
      const wishLines = wishes.map((w) => {
        const p = progressFractionForWish(w);
        const due = w.targetDate ? ` (due ${w.targetDate})` : "";
        const progress = p !== null ? ` — ${Math.round(p * 100)}% done` : "";
        return `"${w.title}"${due}${progress}`;
      });
      lines.push(`Active wishes: ${wishLines.join("; ")}`);
    }
    if (goals.length > 0) {
      const goalLines = goals.map((g) => {
        if (g.metric === "weight") return `weight target ${g.targetValue}kg`;
        const actual = todayHabits.find((h) => h.habitType === g.metric)?.value ?? 0;
        return `${g.metric} target ${g.targetValue} (today so far: ${actual})`;
      });
      lines.push(`Daily habit goals: ${goalLines.join("; ")}`);
    }
    return lines.join("\n");
  } catch (err) {
    console.error("Failed to load goals context for chatAssistant (non-blocking):", err);
    return "";
  }
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

// The deterministic engine behind get_progress_summary — every number here is computed in
// code, never left to the model. Claude only narrates what this returns.
async function computeProgressSummary(apiUrl: string, authHeader: string): Promise<Record<string, unknown>> {
  const now = new Date();
  const todayStr = today();
  const monthStart = `${todayStr.slice(0, 7)}-01`;
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [wishesRes, habitsRes, budgetsRes, expensesRes] = await Promise.all([
    callApi(apiUrl, authHeader, "/wishes", "GET"),
    callApi(apiUrl, authHeader, `/habits?from=${thirtyDaysAgo}&to=${todayStr}`, "GET"),
    callApi(apiUrl, authHeader, "/budgets", "GET"),
    callApi(apiUrl, authHeader, `/expenses?from=${monthStart}&to=${todayStr}`, "GET"),
  ]);

  // Falling-behind detection per wish — same elapsed-time-vs-progress comparison and 0.5/0.3
  // thresholds wishReminderScheduler uses for its one-time push nudge, exposed here as an
  // on-demand answer instead of only a background notification.
  const wishes = (wishesRes.data as { wishes: WishWithProgress[] } | undefined)?.wishes ?? [];
  const wishSummaries = wishes
    .filter((w) => w.status === "active" && w.targetDate)
    .map((wish) => {
      const created = new Date(wish.createdAt);
      const targetAt = new Date(`${wish.targetDate}T23:59:59.000Z`);
      const totalMs = targetAt.getTime() - created.getTime();
      const elapsedFraction = totalMs > 0 ? Math.min((now.getTime() - created.getTime()) / totalMs, 1) : null;
      const progress = progressFractionForWish(wish);
      const fallingBehind =
        progress !== null &&
        elapsedFraction !== null &&
        elapsedFraction > 0.5 &&
        elapsedFraction - progress > 0.3;
      return {
        title: wish.title,
        targetDate: wish.targetDate,
        progressPercent: progress !== null ? Math.round(progress * 100) : null,
        elapsedPercent: elapsedFraction !== null ? Math.round(elapsedFraction * 100) : null,
        fallingBehind,
      };
    });

  // Habit consistency — current streak (consecutive days ending today with status "done")
  // and missed-day counts over the last 7/30 days, per habit.
  const habitLogs = (habitsRes.data as { habits: HabitLog[] } | undefined)?.habits ?? [];
  const habitSummaries = HABIT_TYPES.map((type) => {
    const logsByDate = new Map(habitLogs.filter((h) => h.habitType === type).map((h) => [h.date, h]));
    let currentStreakDays = 0;
    for (let i = 0; ; i++) {
      const d = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
      const log = logsByDate.get(d);
      if (log && log.status === "done") currentStreakDays++;
      else break;
    }
    let missedInLast7Days = 0;
    let missedInLast30Days = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
      const log = logsByDate.get(d);
      const isMissed = !log || log.status !== "done";
      if (isMissed) {
        missedInLast30Days++;
        if (i < 7) missedInLast7Days++;
      }
    }
    return { habitType: type, currentStreakDays, missedInLast7Days, missedInLast30Days };
  });

  // Budget pace projection — new calculation, not reused from anywhere: linear projection of
  // this month's spend based on the daily rate so far, vs. each category's monthly limit.
  const budgets = (budgetsRes.data as { budgets: Budget[] } | undefined)?.budgets ?? [];
  const expenses = (expensesRes.data as { expenses: Expense[] } | undefined)?.expenses ?? [];
  const dayOfMonth = now.getUTCDate();
  const totalDaysInMonth = daysInMonth(now.getUTCFullYear(), now.getUTCMonth());
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const budgetSummaries = budgets.map((budget) => {
    const spentSoFar = expenses
      .filter((e) => e.category === budget.category)
      .reduce((sum, e) => sum + (e.amount ?? 0), 0);
    const projectedMonthEndTotal =
      dayOfMonth > 0 ? (spentSoFar / dayOfMonth) * totalDaysInMonth : spentSoFar;
    return {
      category: budget.category,
      monthlyLimit: budget.monthlyLimit,
      spentSoFar: round2(spentSoFar),
      // Deterministic, not left for the model to subtract itself — same reasoning as every
      // other number in this summary.
      remainingThisMonth: round2(budget.monthlyLimit - spentSoFar),
      projectedMonthEndTotal: round2(projectedMonthEndTotal),
      projectedOverBy: round2(projectedMonthEndTotal - budget.monthlyLimit),
    };
  });

  return { todaysDate: todayStr, wishes: wishSummaries, habits: habitSummaries, budgets: budgetSummaries };
}

const MEMORY_CATEGORIES: MemoryCategory[] = ["health", "financial", "emotional", "consistency", "general"];

const TOOLS: Anthropic.Tool[] = [
  {
    name: "log_habit",
    description:
      "Log or update water, exercise, or steps for a date. Call this when the user reports an amount, e.g. 'I drank 500ml of water' or 'I ran for 30 minutes'.",
    input_schema: {
      type: "object",
      properties: {
        habitType: { type: "string", enum: ["water", "exercise", "steps"] },
        value: {
          type: "number",
          description: "Milliliters for water, minutes for exercise, step count for steps.",
        },
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today if omitted." },
      },
      required: ["habitType", "value"],
    },
  },
  {
    name: "log_entry",
    description:
      "Create a new log entry — food, sleep, weight, body fat, mood, a phone call, or a menstrual cycle event. Call this when the user mentions one of these.",
    input_schema: {
      type: "object",
      properties: {
        logType: {
          type: "string",
          enum: ["food", "sleep", "weight", "bodyFat", "mood", "call", "cycle"],
        },
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today if omitted." },
        data: {
          type: "object",
          description:
            "Shape depends on logType — food: {description, mealType?: breakfast|lunch|dinner|snack}. " +
            "sleep: {bedTime?, wakeTime?} as HH:MM, at least one required. weight: {valueKg}. " +
            "bodyFat: {percentage}. mood: {rating: 1-5, note?}. call: {personName, durationMinutes?, note?}. " +
            "cycle: {event: period_start|period_end|symptom, note?}.",
        },
      },
      required: ["logType", "data"],
    },
  },
  {
    name: "update_log_entry",
    description:
      "Correct an existing log entry's data. Use get_logs first to find the logId if you don't already have it.",
    input_schema: {
      type: "object",
      properties: {
        logId: { type: "string" },
        data: { type: "object", description: "Same shape as log_entry's data field for that entry's logType." },
      },
      required: ["logId", "data"],
    },
  },
  {
    name: "get_logs",
    description:
      "Look up recently logged food, sleep, weight, mood, calls, or cycle events — e.g. to answer 'what did I log for food today' or to find a logId before calling update_log_entry.",
    input_schema: {
      type: "object",
      properties: {
        logType: {
          type: "string",
          enum: ["food", "sleep", "weight", "bodyFat", "mood", "call", "cycle"],
        },
        from: { type: "string", description: "YYYY-MM-DD" },
        to: { type: "string", description: "YYYY-MM-DD" },
      },
    },
  },
  {
    name: "log_routine_step",
    description:
      "Mark a routine checklist step done or skipped for a date. routineId and stepIndex must be exact values already known from conversation context or a prior tool result — never guess them; call get_routines first if you don't have them.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today if omitted." },
        routineId: { type: "string" },
        stepIndex: { type: "integer", minimum: 0 },
        status: { type: "string", enum: ["done", "skipped"] },
      },
      required: ["routineId", "stepIndex", "status"],
    },
  },
  {
    name: "log_medication",
    description:
      "Mark a medication taken or missed for a date. medicationId must be an exact value already known from conversation context or a prior tool result — never guess it; call get_medications first if you don't have it.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today if omitted." },
        medicationId: { type: "string" },
        status: { type: "string", enum: ["taken", "missed"] },
      },
      required: ["medicationId", "status"],
    },
  },
  {
    name: "create_task",
    description: "Create a new to-do task, optionally with a due date/time.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        dueDate: { type: "string", description: "YYYY-MM-DD" },
        dueTime: { type: "string", description: "HH:MM 24-hour" },
      },
      required: ["title"],
    },
  },
  {
    name: "get_schedule",
    description: "Get the tasks and habit logs for a specific date.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today if omitted." },
      },
    },
  },
  {
    name: "get_tasks",
    description: "Get all of the user's tasks (any status, any due date).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "search_journal",
    description:
      "Semantically search the user's past journal entries by meaning, not just keywords — e.g. to answer 'when did I last mention feeling stressed about work' or 'what have I said about my trip to Japan'. Returns the most relevant entries, not necessarily recent ones.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for, in natural language." },
      },
      required: ["query"],
    },
  },
  {
    name: "log_journal_entry",
    description:
      "Write a journal entry for a date, separate from this chat's own conversation history. Only call this when the user explicitly asks to log something in their journal.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today if omitted." },
        text: { type: "string" },
      },
      required: ["text"],
    },
  },
  {
    name: "get_meal_plan",
    description:
      "Get the user's planned meals for a date range — call this before commenting on, critiquing, or suggesting changes to their meal plan, so you're reacting to what's actually planned rather than guessing.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "YYYY-MM-DD" },
        to: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "set_meal_plan",
    description:
      "Set or change one planned meal slot. Use this when the user agrees to a specific change during a conversation about their meal plan (e.g. 'swap Wednesday dinner for something lighter' after you've suggested one).",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD" },
        mealType: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
        text: { type: "string", description: "The planned meal, e.g. 'Grilled salmon with steamed broccoli'." },
      },
      required: ["date", "mealType", "text"],
    },
  },
  {
    name: "get_meal_plan_template",
    description:
      "Get the user's weekly default meals (e.g. 'what do I usually have on Mondays') — these are the recurring defaults that fill a day unless a specific date was overridden.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "set_meal_plan_template",
    description:
      "Set a recurring weekly default meal for a day of the week (e.g. 'I usually have oatmeal on weekday mornings' — call once per weekday). This does not touch any specific date's plan, only the default that future dates fall back to.",
    input_schema: {
      type: "object",
      properties: {
        dayOfWeek: { type: "integer", minimum: 0, maximum: 6, description: "0=Sunday..6=Saturday." },
        mealType: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
        text: { type: "string" },
      },
      required: ["dayOfWeek", "mealType", "text"],
    },
  },
  {
    name: "create_routine_template",
    description:
      "Create a new multi-step routine checklist (e.g. a skincare or morning routine) when the user describes one. Each step is a short text description, not a tool with its own fields. If the user says it only happens on certain days (e.g. 'every Sunday' or 'weekdays'), set daysOfWeek instead of just putting the day in the name — leave daysOfWeek unset for a routine done every day.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", enum: ["skinCare", "hairCare", "dailyRoutine", "custom"] },
        name: { type: "string" },
        steps: { type: "array", items: { type: "string" }, description: "One entry per step, in order." },
        daysOfWeek: {
          type: "array",
          items: { type: "integer", minimum: 0, maximum: 6 },
          description: "Days this routine runs on: 0=Sunday, 1=Monday, ..., 6=Saturday. Omit entirely if it runs every day.",
        },
      },
      required: ["category", "name", "steps"],
    },
  },
  {
    name: "get_routines",
    description: "List all of the user's routine checklists — call this to find a routineId before update_routine_template/delete_routine_template/log_routine_step, if you don't already have it.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "update_routine_template",
    description:
      "Change an existing routine's name, category, steps, or day-of-week schedule. routineId must be an exact value already known from conversation context or a prior tool result — never guess it; call get_routines first if you don't have it. Only include the fields that are changing.",
    input_schema: {
      type: "object",
      properties: {
        routineId: { type: "string" },
        name: { type: "string" },
        category: { type: "string", enum: ["skinCare", "hairCare", "dailyRoutine", "custom"] },
        steps: { type: "array", items: { type: "string" } },
        daysOfWeek: {
          type: "array",
          items: { type: "integer", minimum: 0, maximum: 6 },
          description: "0=Sunday..6=Saturday. Pass every day (or omit this field) to make it run daily again.",
        },
      },
      required: ["routineId"],
    },
  },
  {
    name: "delete_routine_template",
    description:
      "Permanently remove a routine checklist. routineId must be an exact value already known from conversation context or a prior tool result — never guess it; call get_routines first if you don't have it.",
    input_schema: {
      type: "object",
      properties: { routineId: { type: "string" } },
      required: ["routineId"],
    },
  },
  {
    name: "create_medication",
    description:
      "Add a new medication the user says they're taking. durationDays is required — if the user gives an end date or doesn't say how long, work out a reasonable number of days (e.g. 'ongoing' or no end mentioned → a large number like 365). If they mention a reminder time, set timeOfDay — never guess timezoneOffsetMinutes yourself, it's filled in automatically.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        dosage: { type: "string", description: "e.g. '500mg'" },
        notes: { type: "string", description: "e.g. 'take with food'" },
        startDate: { type: "string", description: "YYYY-MM-DD. Defaults to today if omitted." },
        durationDays: { type: "integer", minimum: 1 },
        timeOfDay: { type: "string", description: "HH:MM 24-hour — when to send a daily reminder, if the user wants one." },
      },
      required: ["name", "durationDays"],
    },
  },
  {
    name: "get_medications",
    description: "List all of the user's medications — call this to find a medicationId before update_medication/delete_medication, if you don't already have it.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "update_medication",
    description:
      "Change an existing medication's name, dosage, notes, duration, or reminder time. medicationId must be an exact value already known from conversation context or a prior tool result — never guess it; call get_medications first if you don't have it.",
    input_schema: {
      type: "object",
      properties: {
        medicationId: { type: "string" },
        name: { type: "string" },
        dosage: { type: "string" },
        notes: { type: "string" },
        startDate: { type: "string", description: "YYYY-MM-DD" },
        durationDays: { type: "integer", minimum: 1 },
        timeOfDay: { type: "string", description: "HH:MM 24-hour, or omit to leave unchanged." },
      },
      required: ["medicationId"],
    },
  },
  {
    name: "delete_medication",
    description:
      "Permanently remove a medication. medicationId must be an exact value already known from conversation context or a prior tool result — never guess it; call get_medications first if you don't have it.",
    input_schema: {
      type: "object",
      properties: { medicationId: { type: "string" } },
      required: ["medicationId"],
    },
  },
  {
    name: "create_wish",
    description:
      "Create a new goal/wish when the user describes one. Required fields depend on progressMode: 'habit_linked' needs linkedHabitType + habitLinkTargetValue (e.g. 'exercise 30 times'); 'quantity' needs quantityTarget (+ optional quantityUnit); 'time_based' needs targetDate; 'percentage' and 'milestone' need neither (percentage starts at 0, milestones are added later). Pick the mode that best fits how the user described progress — don't ask them to choose a mode by name.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        type: {
          type: "string",
          enum: ["learning", "travel", "savings", "health", "shopping", "creative", "personal_growth", "achievement"],
        },
        progressMode: { type: "string", enum: ["percentage", "milestone", "habit_linked", "time_based", "quantity"] },
        targetDate: { type: "string", description: "YYYY-MM-DD — required for time_based, optional otherwise as a deadline." },
        quantityTarget: { type: "number", description: "Required for quantity mode." },
        quantityUnit: { type: "string", description: "e.g. 'books', 'km' — optional, quantity mode only." },
        linkedHabitType: { type: "string", enum: ["water", "exercise", "steps"], description: "Required for habit_linked mode." },
        habitLinkTargetValue: { type: "number", description: "Required for habit_linked mode — the cumulative target." },
      },
      required: ["title", "type", "progressMode"],
    },
  },
  {
    name: "create_expense",
    description: "Log a new expense when the user mentions spending money, e.g. 'I spent 400 on groceries'.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", enum: EXPENSE_CATEGORIES },
        amount: { type: "number", minimum: 0 },
        note: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today if omitted." },
      },
      required: ["category", "amount"],
    },
  },
  {
    name: "get_expenses",
    description:
      "Look up recently logged expenses — e.g. to answer 'how much did I spend on food this week' or to find an expenseId before calling update_expense/delete_expense.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", enum: EXPENSE_CATEGORIES },
        from: { type: "string", description: "YYYY-MM-DD" },
        to: { type: "string", description: "YYYY-MM-DD" },
      },
    },
  },
  {
    name: "update_expense",
    description:
      "Correct an existing expense's category, amount, note, or date. expenseId must be an exact value already known from conversation context or a prior tool result — never guess it; use get_expenses first if you don't have it.",
    input_schema: {
      type: "object",
      properties: {
        expenseId: { type: "string" },
        category: { type: "string", enum: EXPENSE_CATEGORIES },
        amount: { type: "number", minimum: 0 },
        note: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["expenseId"],
    },
  },
  {
    name: "delete_expense",
    description:
      "Permanently remove a logged expense. expenseId must be an exact value already known from conversation context or a prior tool result — never guess it.",
    input_schema: {
      type: "object",
      properties: { expenseId: { type: "string" } },
      required: ["expenseId"],
    },
  },
  {
    name: "set_budget",
    description:
      "Set the user's monthly spending limit for one expense category, e.g. 'cap my food spending at 8000 a month'. This is separate from update_profile's overall monthlyBudget.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", enum: EXPENSE_CATEGORIES },
        monthlyLimit: { type: "number", minimum: 0 },
      },
      required: ["category", "monthlyLimit"],
    },
  },
  {
    name: "update_profile",
    description: "Update the user's height, sex, or monthly budget when they mention one in conversation.",
    input_schema: {
      type: "object",
      properties: {
        heightCm: { type: "number" },
        sex: { type: "string", enum: ["male", "female", "unspecified"] },
        monthlyBudget: { type: "number" },
      },
    },
  },
  {
    name: "set_goal",
    description: "Set the user's daily target for a habit, or their target weight, when they mention one.",
    input_schema: {
      type: "object",
      properties: {
        metric: { type: "string", enum: ["water", "exercise", "steps", "weight"] },
        targetValue: { type: "number", description: "ml/day for water, minutes/day for exercise, steps/day for steps, kg for weight." },
      },
      required: ["metric", "targetValue"],
    },
  },
  {
    name: "get_progress_summary",
    description:
      "Get a deterministically computed snapshot of how the user is actually tracking: which active Wishes are falling behind schedule, current streaks and missed-day counts for each habit, and each budget category's spending so far this month — including remainingThisMonth (use this directly for 'how much do I have left to spend on X' questions, never subtract spentSoFar from monthlyLimit yourself) and a projected month-end total based on this month's spending pace so far. Always call this before making any claim about whether the user is on track, off track, ahead/behind, or how much budget remains — never estimate or compute these numbers yourself.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "remember_fact",
    description:
      "Save a short, durable fact about the user for future conversations — something worth remembering long-term, not a one-off detail. Call this when the user shares something like a goal, a preference, a recurring struggle, or context that would help you understand them better later (e.g. 'saving for a trip to Japan', 'gets anxious before big presentations', 'prefers strength training over cardio'). Don't call this for routine logging (that's what the other tools are for) or trivial small talk.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The fact, written concisely in third person, e.g. 'Is saving up for a trip to Japan.'" },
        category: {
          type: "string",
          enum: MEMORY_CATEGORIES,
          description: "Which area of the user's life this fact relates to.",
        },
      },
      required: ["text", "category"],
    },
  },
];

async function executeTool(
  apiUrl: string,
  userId: string,
  name: string,
  input: Record<string, unknown>,
  authHeader: string,
  timezoneOffsetMinutes: number | undefined,
): Promise<{ content: string; isError: boolean }> {
  try {
    let result: { status: number; data: unknown };
    switch (name) {
      case "log_habit": {
        const date = (input.date as string) || today();
        result = await callApi(apiUrl, authHeader, `/habits/${date}/${input.habitType}`, "PATCH", {
          value: input.value,
        });
        break;
      }
      case "log_entry": {
        result = await callApi(apiUrl, authHeader, "/logs", "POST", {
          logType: input.logType,
          date: (input.date as string) || today(),
          data: input.data,
        });
        break;
      }
      case "update_log_entry": {
        result = await callApi(apiUrl, authHeader, `/logs/${input.logId}`, "PATCH", { data: input.data });
        break;
      }
      case "get_logs": {
        const params = new URLSearchParams();
        if (input.logType) params.set("logType", input.logType as string);
        if (input.from) params.set("from", input.from as string);
        if (input.to) params.set("to", input.to as string);
        const qs = params.toString();
        result = await callApi(apiUrl, authHeader, `/logs${qs ? `?${qs}` : ""}`, "GET");
        break;
      }
      case "log_routine_step": {
        const date = (input.date as string) || today();
        result = await callApi(
          apiUrl,
          authHeader,
          `/routine-logs/${date}/${input.routineId}/${input.stepIndex}`,
          "PATCH",
          { status: input.status },
        );
        break;
      }
      case "log_medication": {
        const date = (input.date as string) || today();
        result = await callApi(apiUrl, authHeader, `/medication-logs/${date}/${input.medicationId}`, "PATCH", {
          status: input.status,
        });
        break;
      }
      case "create_task": {
        result = await callApi(apiUrl, authHeader, "/tasks", "POST", {
          title: input.title,
          description: input.description,
          dueDate: input.dueDate,
          dueTime: input.dueTime,
          suggestPriority: true,
        });
        break;
      }
      case "get_schedule": {
        const date = (input.date as string) || today();
        result = await callApi(apiUrl, authHeader, `/schedule/${date}`, "GET");
        break;
      }
      case "get_tasks": {
        result = await callApi(apiUrl, authHeader, "/tasks", "GET");
        break;
      }
      case "search_journal": {
        result = await callApi(apiUrl, authHeader, "/journal/search", "POST", { query: input.query });
        break;
      }
      case "log_journal_entry": {
        result = await callApi(apiUrl, authHeader, "/journal", "POST", {
          date: (input.date as string) || today(),
          text: input.text,
        });
        break;
      }
      case "get_meal_plan": {
        const params = new URLSearchParams({ from: input.from as string, to: input.to as string });
        result = await callApi(apiUrl, authHeader, `/meal-plan?${params.toString()}`, "GET");
        break;
      }
      case "set_meal_plan": {
        result = await callApi(
          apiUrl,
          authHeader,
          `/meal-plan/${input.date}/${input.mealType}`,
          "PATCH",
          { text: input.text },
        );
        break;
      }
      case "get_meal_plan_template": {
        result = await callApi(apiUrl, authHeader, "/meal-plan-templates", "GET");
        break;
      }
      case "set_meal_plan_template": {
        result = await callApi(
          apiUrl,
          authHeader,
          `/meal-plan-templates/${input.dayOfWeek}/${input.mealType}`,
          "PATCH",
          { text: input.text },
        );
        break;
      }
      case "get_routines": {
        result = await callApi(apiUrl, authHeader, "/routines", "GET");
        break;
      }
      case "create_routine_template": {
        result = await callApi(apiUrl, authHeader, "/routines", "POST", {
          category: input.category,
          name: input.name,
          steps: input.steps,
          daysOfWeek: input.daysOfWeek,
        });
        break;
      }
      case "update_routine_template": {
        result = await callApi(apiUrl, authHeader, `/routines/${input.routineId}`, "PATCH", {
          name: input.name,
          category: input.category,
          steps: input.steps,
          daysOfWeek: input.daysOfWeek,
        });
        break;
      }
      case "delete_routine_template": {
        result = await callApi(apiUrl, authHeader, `/routines/${input.routineId}`, "DELETE");
        break;
      }
      case "get_medications": {
        result = await callApi(apiUrl, authHeader, "/medications", "GET");
        break;
      }
      case "create_medication": {
        result = await callApi(apiUrl, authHeader, "/medications", "POST", {
          name: input.name,
          dosage: input.dosage,
          notes: input.notes,
          startDate: input.startDate,
          durationDays: input.durationDays,
          timeOfDay: input.timeOfDay,
          timezoneOffsetMinutes: input.timeOfDay ? timezoneOffsetMinutes : undefined,
        });
        break;
      }
      case "update_medication": {
        result = await callApi(apiUrl, authHeader, `/medications/${input.medicationId}`, "PATCH", {
          name: input.name,
          dosage: input.dosage,
          notes: input.notes,
          startDate: input.startDate,
          durationDays: input.durationDays,
          timeOfDay: input.timeOfDay,
          timezoneOffsetMinutes: input.timeOfDay ? timezoneOffsetMinutes : undefined,
        });
        break;
      }
      case "delete_medication": {
        result = await callApi(apiUrl, authHeader, `/medications/${input.medicationId}`, "DELETE");
        break;
      }
      case "create_wish": {
        result = await callApi(apiUrl, authHeader, "/wishes", "POST", {
          title: input.title,
          type: input.type,
          progressMode: input.progressMode,
          targetDate: input.targetDate,
          quantityTarget: input.quantityTarget,
          quantityUnit: input.quantityUnit,
          linkedHabitType: input.linkedHabitType,
          habitLinkTargetValue: input.habitLinkTargetValue,
        });
        break;
      }
      case "create_expense": {
        result = await callApi(apiUrl, authHeader, "/expenses", "POST", {
          category: input.category,
          amount: input.amount,
          note: input.note,
          date: (input.date as string) || today(),
        });
        break;
      }
      case "get_expenses": {
        const params = new URLSearchParams();
        if (input.category) params.set("category", input.category as string);
        if (input.from) params.set("from", input.from as string);
        if (input.to) params.set("to", input.to as string);
        const qs = params.toString();
        result = await callApi(apiUrl, authHeader, `/expenses${qs ? `?${qs}` : ""}`, "GET");
        break;
      }
      case "update_expense": {
        result = await callApi(apiUrl, authHeader, `/expenses/${input.expenseId}`, "PATCH", {
          category: input.category,
          amount: input.amount,
          note: input.note,
          date: input.date,
        });
        break;
      }
      case "delete_expense": {
        result = await callApi(apiUrl, authHeader, `/expenses/${input.expenseId}`, "DELETE");
        break;
      }
      case "set_budget": {
        result = await callApi(apiUrl, authHeader, `/budgets/${input.category}`, "PUT", {
          monthlyLimit: input.monthlyLimit,
        });
        break;
      }
      case "update_profile": {
        result = await callApi(apiUrl, authHeader, "/profile", "PATCH", {
          heightCm: input.heightCm,
          sex: input.sex,
          monthlyBudget: input.monthlyBudget,
        });
        break;
      }
      case "set_goal": {
        result = await callApi(apiUrl, authHeader, `/goals/${input.metric}`, "PATCH", {
          targetValue: input.targetValue,
        });
        break;
      }
      case "get_progress_summary": {
        const summary = await computeProgressSummary(apiUrl, authHeader);
        return { content: JSON.stringify(summary), isError: false };
      }
      case "remember_fact": {
        // The one place this Lambda writes to DynamoDB directly — there's no existing API
        // route for user memory to forward to, unlike every other tool above.
        const now = new Date().toISOString();
        const item: UserMemory = {
          userId,
          memoryId: `${Date.now()}-${randomUUID()}`,
          text: input.text as string,
          category: input.category as MemoryCategory,
          createdAt: now,
        };
        await ddb.send(new PutCommand({ TableName: process.env.USER_MEMORY_TABLE_NAME, Item: item }));
        return { content: "Remembered.", isError: false };
      }
      default:
        return { content: `Unknown tool: ${name}`, isError: true };
    }
    if (result.status >= 400) {
      return { content: JSON.stringify(result.data ?? { error: `HTTP ${result.status}` }), isError: true };
    }
    return { content: JSON.stringify(result.data ?? {}), isError: false };
  } catch (err) {
    return { content: err instanceof Error ? err.message : "Tool execution failed", isError: true };
  }
}

let cachedApiKey: string | undefined;
let cachedClient: Anthropic | undefined;

async function getClient(): Promise<Anthropic> {
  if (cachedClient) return cachedClient;
  if (!cachedApiKey) {
    const ssm = new SSMClient({});
    const result = await ssm.send(
      new GetParameterCommand({ Name: process.env.ANTHROPIC_API_KEY_PARAM, WithDecryption: true }),
    );
    if (!result.Parameter?.Value) throw new Error("Anthropic API key parameter is empty");
    cachedApiKey = result.Parameter.Value;
  }
  cachedClient = new Anthropic({ apiKey: cachedApiKey });
  return cachedClient;
}

const ONBOARDING_SYSTEM_PROMPT_ADDITION =
  "\n\nThis is a first conversation, right after the user finished a quick setup form (height, " +
  "sex, daily targets — already saved, don't ask for those again). Welcome them briefly, then " +
  "ask a handful of short, open, one-at-a-time questions to learn more — routines they follow, " +
  "medications they take, goals or wishes they have in mind, anything that'd help you help them " +
  "later. This is a first conversation, not an interrogation — a few exchanges, not a long form. " +
  "The actual point: whenever they describe something structured — a routine, a medication, a " +
  "goal, a wish, a profile detail — call the matching creation tool (create_routine_template, " +
  "create_medication, create_wish, set_goal, update_profile) immediately so it becomes a real " +
  "part of the app, not just a remembered fact. Only use remember_fact for genuinely " +
  "qualitative context that doesn't fit one of those tools — a motivation, a struggle, a " +
  "preference.";

function buildSystemPrompt(memories: UserMemory[], goalsContext: string, isOnboarding: boolean): string {
  const base =
    "You are the LifeOs assistant — a supportive, conversational personal life-management " +
    "companion. You can read, log, create, edit, and delete the user's tasks, habits, logs " +
    "(food/sleep/weight/mood/calls/cycle), routines (including their day-of-week schedule), " +
    "medications (including reminder times), expenses and budgets (with category), meal plans " +
    "(both a specific date and recurring weekly defaults), wishes, goals, profile details, and " +
    "journal via the tools available to you. " +
    `Today's date is ${today()}. When the user reports something that maps to a tool (a habit ` +
    "amount, a food/sleep/mood/etc. entry, a task, a routine or medication tick, an expense, a " +
    "new or edited routine/medication/expense/budget/meal-plan-default/wish/goal/profile " +
    "detail), call the matching tool rather than just acknowledging it in text — logging, " +
    "planning, and editing things is the point of this chat, not just talking about them. Keep " +
    "replies short and natural, like a real conversation, since they may be spoken aloud. Never " +
    "invent numbers or facts you don't have — call a get_* tool to check before answering a " +
    "question about the user's own data. When the user shares something durable worth " +
    "remembering for future conversations that doesn't fit one of the other tools, call " +
    "remember_fact.\n\n" +
    "Coaching style — honest accountability, not pure cheerleading: when discussing the " +
    "user's wishes, habits, or budget, call get_progress_summary first and ground everything " +
    "in its numbers. If it shows a wish falling behind schedule, a broken habit streak, or " +
    "spending on pace to exceed a budget, say so plainly and name the specific gap and its " +
    "projected outcome BEFORE offering encouragement — don't soften or bury it. Still be warm " +
    "and supportive, but the honest number comes first, every time." +
    (isOnboarding ? ONBOARDING_SYSTEM_PROMPT_ADDITION : "");

  const sections = [goalsContext, memories.length > 0 ? memoryText(memories) : ""].filter(Boolean);
  return sections.length === 0 ? base : `${base}\n\n${sections.join("\n\n")}`;
}

function memoryText(memories: UserMemory[]): string {
  const memoryLines = memories.map((m) => `- (${m.category}) ${m.text}`).join("\n");
  return `What you already know about this user, from past conversations:\n${memoryLines}`;
}

export const handler = awslambda.streamifyResponse(async (event: APIGatewayProxyEventV2, rawStream) => {
  const authHeader = event.headers?.authorization ?? event.headers?.Authorization;

  // Verified before committing to any HTTP status — once HttpResponseStream.from() is called
  // below, the status code is locked in, so an invalid/missing token must be rejected with a
  // real 401 here rather than as a chunk inside an already-200'd stream.
  let userId: string;
  try {
    userId = await verifyIdToken(authHeader);
  } catch {
    const unauthedStream = awslambda.HttpResponseStream.from(rawStream, {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
    });
    unauthedStream.write(JSON.stringify({ error: "Unauthorized" }));
    unauthedStream.end();
    return;
  }

  const responseStream = awslambda.HttpResponseStream.from(rawStream, {
    statusCode: 200,
    headers: { "Content-Type": "application/x-ndjson" },
  });

  try {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body ?? "{}");
    } catch {
      writeEvent(responseStream, { type: "error", message: "Invalid JSON body" });
      responseStream.end();
      return;
    }

    const userMessage = typeof body.message === "string" ? body.message.trim() : "";
    const isOnboarding = body.mode === "onboarding";
    const attachment = parseAttachment(body);
    // Only ever sourced from the client's own clock (JS Date#getTimezoneOffset() convention),
    // never from the model — see create_medication/update_medication's tool descriptions.
    const timezoneOffsetMinutes =
      typeof body.timezoneOffsetMinutes === "number" ? body.timezoneOffsetMinutes : undefined;
    if (!userMessage && !attachment) {
      writeEvent(responseStream, { type: "error", message: "message is required" });
      responseStream.end();
      return;
    }
    const conversationId =
      typeof body.conversationId === "string" && body.conversationId ? body.conversationId : randomUUID();

    const [historyResult, memoryResult, goalsContext, profileResult] = await Promise.all([
      ddb.send(
        new QueryCommand({
          TableName: process.env.ASSISTANT_CONVERSATIONS_TABLE_NAME,
          KeyConditionExpression: "userId = :userId AND begins_with(conversationTurn, :prefix)",
          ExpressionAttributeValues: { ":userId": userId, ":prefix": `${conversationId}#` },
        }),
      ),
      // Small table, no pagination concern at personal scale — every remembered fact is loaded
      // into every conversation's system prompt.
      ddb.send(
        new QueryCommand({
          TableName: process.env.USER_MEMORY_TABLE_NAME,
          KeyConditionExpression: "userId = :userId",
          ExpressionAttributeValues: { ":userId": userId },
        }),
      ),
      fetchGoalsContext(API_URL, authHeader as string),
      callApi(API_URL, authHeader as string, "/profile", "GET"),
    ]);
    const historyItems = ((historyResult.Items ?? []) as AssistantConversationTurn[]).slice(-HISTORY_TURN_LIMIT);
    const memories = (memoryResult.Items ?? []) as UserMemory[];
    const assistantModel =
      ((profileResult.data as { assistantModel?: string } | undefined)?.assistantModel) || "claude-haiku-4-5";

    // Persisted history always stays a plain string — base64 attachment data can be
    // megabytes, far past DynamoDB's 400KB item cap, and there's no need to replay a file
    // back to the model on every later turn anyway. The real content block is only built for
    // this request; later turns just see the placeholder text below.
    let userContent: Anthropic.MessageParam["content"] = userMessage;
    let persistedUserText = userMessage;
    if (attachment) {
      try {
        const attachmentBlock = await buildAttachmentBlock(userId, attachment);
        userContent = [
          attachmentBlock,
          { type: "text", text: userMessage || "Here's a file I wanted to share." },
        ];
        persistedUserText = `${userMessage ? `${userMessage}\n\n` : ""}[Attached ${attachment.fileName}]`;
      } catch (err) {
        writeEvent(responseStream, {
          type: "error",
          message: err instanceof Error ? err.message : "Failed to read the attached file",
        });
        responseStream.end();
        return;
      }
    }

    const messages: Anthropic.MessageParam[] = [
      ...historyItems.map((item) => ({ role: item.role, content: item.content }) as Anthropic.MessageParam),
      { role: "user", content: userContent },
    ];

    const client = await getClient();
    const systemPrompt = buildSystemPrompt(memories, goalsContext, isOnboarding);
    let finalText = "";

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const stream = client.messages.stream({
        model: assistantModel,
        max_tokens: 1024,
        system: systemPrompt,
        tools: TOOLS,
        messages,
      });
      stream.on("text", (delta) => {
        writeEvent(responseStream, { type: "text", delta });
      });
      const response = await stream.finalMessage();

      const textBlocks = response.content.filter((b) => b.type === "text");
      if (textBlocks.length > 0) {
        finalText = textBlocks.map((b) => b.text).join("\n");
      }

      if (response.stop_reason !== "tool_use") break;

      messages.push({ role: "assistant", content: response.content });

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tool of toolUseBlocks) {
        writeEvent(responseStream, { type: "tool_use", name: tool.name });
        const { content, isError } = await executeTool(
          API_URL,
          userId,
          tool.name,
          tool.input as Record<string, unknown>,
          authHeader as string,
          timezoneOffsetMinutes,
        );
        toolResults.push({ type: "tool_result", tool_use_id: tool.id, content, is_error: isError });
      }
      messages.push({ role: "user", content: toolResults });
    }

    if (!finalText) {
      finalText = "Sorry, I got a bit stuck on that one — could you try rephrasing?";
    }

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    await ddb.send(
      new PutCommand({
        TableName: process.env.ASSISTANT_CONVERSATIONS_TABLE_NAME,
        Item: {
          userId,
          conversationTurn: `${conversationId}#${String(now).padStart(15, "0")}`,
          conversationId,
          role: "user",
          content: persistedUserText,
          createdAt: nowIso,
        } satisfies AssistantConversationTurn,
      }),
    );
    await ddb.send(
      new PutCommand({
        TableName: process.env.ASSISTANT_CONVERSATIONS_TABLE_NAME,
        Item: {
          userId,
          conversationTurn: `${conversationId}#${String(now + 1).padStart(15, "0")}`,
          conversationId,
          role: "assistant",
          content: finalText,
          createdAt: new Date(now + 1).toISOString(),
        } satisfies AssistantConversationTurn,
      }),
    );

    writeEvent(responseStream, { type: "done", conversationId });
    responseStream.end();
  } catch (err) {
    console.error("chatAssistant stream error:", err);
    try {
      writeEvent(responseStream, { type: "error", message: "Something went wrong. Please try again." });
      responseStream.end();
    } catch {
      // Stream may already be closed — nothing more we can do.
    }
  }
});
