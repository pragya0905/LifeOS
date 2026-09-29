import type { APIGatewayProxyEventV2 } from "aws-lambda";
import Anthropic from "@anthropic-ai/sdk";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { randomUUID } from "node:crypto";
import { ddb } from "../../common/dynamo";
import { verifyIdToken } from "../../common/jwtVerify";
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
      "Mark a routine checklist step done or skipped for a date. routineId and stepIndex must be exact values already known from conversation context or a prior tool result — never guess them.",
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
      "Mark a medication taken or missed for a date. medicationId must be an exact value already known from conversation context or a prior tool result — never guess it.",
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
    name: "get_progress_summary",
    description:
      "Get a deterministically computed snapshot of how the user is actually tracking: which active Wishes are falling behind schedule, current streaks and missed-day counts for each habit, and a projected month-end total for each budget category based on this month's spending pace so far. Always call this before making any claim about whether the user is on track, off track, or ahead/behind — never estimate or guess these numbers yourself.",
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

function buildSystemPrompt(memories: UserMemory[], goalsContext: string): string {
  const base =
    "You are the LifeOs assistant — a supportive, conversational personal life-management " +
    "companion. You can read and log the user's tasks, habits, logs (food/sleep/weight/mood/" +
    "calls/cycle), routine steps, medications, and journal via the tools available to you. " +
    `Today's date is ${today()}. When the user reports something that maps to a tool (a habit ` +
    "amount, a food/sleep/mood/etc. entry, a task, a routine or medication tick), call the " +
    "matching tool rather than just acknowledging it in text — logging things is the point of " +
    "this chat. Keep replies short and natural, like a real conversation, since they may be " +
    "spoken aloud. Never invent numbers or facts you don't have — call a get_* tool to check " +
    "before answering a question about the user's own data. When the user shares something " +
    "durable worth remembering for future conversations, call remember_fact.\n\n" +
    "Coaching style — honest accountability, not pure cheerleading: when discussing the " +
    "user's wishes, habits, or budget, call get_progress_summary first and ground everything " +
    "in its numbers. If it shows a wish falling behind schedule, a broken habit streak, or " +
    "spending on pace to exceed a budget, say so plainly and name the specific gap and its " +
    "projected outcome BEFORE offering encouragement — don't soften or bury it. Still be warm " +
    "and supportive, but the honest number comes first, every time.";

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
    if (!userMessage) {
      writeEvent(responseStream, { type: "error", message: "message is required" });
      responseStream.end();
      return;
    }
    const conversationId =
      typeof body.conversationId === "string" && body.conversationId ? body.conversationId : randomUUID();

    const [historyResult, memoryResult, goalsContext] = await Promise.all([
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
    ]);
    const historyItems = ((historyResult.Items ?? []) as AssistantConversationTurn[]).slice(-HISTORY_TURN_LIMIT);
    const memories = (memoryResult.Items ?? []) as UserMemory[];

    const messages: Anthropic.MessageParam[] = [
      ...historyItems.map((item) => ({ role: item.role, content: item.content }) as Anthropic.MessageParam),
      { role: "user", content: userMessage },
    ];

    const client = await getClient();
    const systemPrompt = buildSystemPrompt(memories, goalsContext);
    let finalText = "";

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const stream = client.messages.stream({
        model: "claude-haiku-4-5",
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
          content: userMessage,
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
