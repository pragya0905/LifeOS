import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { ddb } from "./dynamo";
import { extractJournalInfo } from "./claude";
import { computeEndDate } from "./medications";
import { LOG_ENTRY_SCHEMAS, SINGULAR_LOG_TYPES } from "./logEntrySchemas";
import type {
  Expense,
  HabitType,
  HabitUnit,
  JournalEntry,
  LogEntry,
  LogType,
  Medication,
  RoutineTemplate,
} from "./types";

const HABIT_UNIT: Record<HabitType, HabitUnit> = {
  water: "ml",
  exercise: "minutes",
  steps: "steps",
};

async function writeAiHabitLog(
  userId: string,
  date: string,
  habitType: HabitType,
  value: number,
): Promise<void> {
  const now = new Date().toISOString();
  const status = value > 0 ? "done" : "missed";
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: process.env.HABITS_TABLE_NAME,
        Key: { userId, dateHabitType: `${date}#${habitType}` },
        UpdateExpression:
          "SET #date = :date, #habitType = :habitType, #status = :status, #value = :value, " +
          "#unit = :unit, #source = :source, updatedAt = :updatedAt, " +
          "createdAt = if_not_exists(createdAt, :updatedAt)",
        ConditionExpression: "attribute_not_exists(dateHabitType) OR #source = :aiSource",
        ExpressionAttributeNames: {
          "#date": "date",
          "#habitType": "habitType",
          "#status": "status",
          "#value": "value",
          "#unit": "unit",
          "#source": "source",
        },
        ExpressionAttributeValues: {
          ":date": date,
          ":habitType": habitType,
          ":status": status,
          ":value": value,
          ":unit": HABIT_UNIT[habitType],
          ":source": "ai-journal",
          ":aiSource": "ai-journal",
          ":updatedAt": now,
        },
      }),
    );
  } catch (err) {
    // A manual entry already exists for this date+habit — manual always wins, no exceptions.
    if (err instanceof Error && err.name === "ConditionalCheckFailedException") return;
    throw err;
  }
}

async function writeAiMedicationLog(
  userId: string,
  date: string,
  medicationId: string,
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: process.env.MEDICATION_LOGS_TABLE_NAME,
        Key: { userId, dateMedicationId: `${date}#${medicationId}` },
        UpdateExpression:
          "SET #date = :date, #medicationId = :medicationId, #status = :status, " +
          "#source = :source, updatedAt = :updatedAt, createdAt = if_not_exists(createdAt, :updatedAt)",
        ConditionExpression: "attribute_not_exists(dateMedicationId) OR #source = :aiSource",
        ExpressionAttributeNames: {
          "#date": "date",
          "#medicationId": "medicationId",
          "#status": "status",
          "#source": "source",
        },
        ExpressionAttributeValues: {
          ":date": date,
          ":medicationId": medicationId,
          ":status": "taken",
          ":source": "ai-journal",
          ":aiSource": "ai-journal",
          ":updatedAt": now,
        },
      }),
    );
  } catch (err) {
    if (err instanceof Error && err.name === "ConditionalCheckFailedException") return;
    throw err;
  }
}

async function writeAiRoutineStepLog(
  userId: string,
  date: string,
  routineId: string,
  stepIndex: number,
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: process.env.ROUTINE_LOGS_TABLE_NAME,
        Key: { userId, dateRoutineStep: `${date}#${routineId}#${stepIndex}` },
        UpdateExpression:
          "SET #date = :date, #routineId = :routineId, #stepIndex = :stepIndex, #status = :status, " +
          "#source = :source, updatedAt = :updatedAt, createdAt = if_not_exists(createdAt, :updatedAt)",
        ConditionExpression: "attribute_not_exists(dateRoutineStep) OR #source = :aiSource",
        ExpressionAttributeNames: {
          "#date": "date",
          "#routineId": "routineId",
          "#stepIndex": "stepIndex",
          "#status": "status",
          "#source": "source",
        },
        ExpressionAttributeValues: {
          ":date": date,
          ":routineId": routineId,
          ":stepIndex": stepIndex,
          ":status": "done",
          ":source": "ai-journal",
          ":aiSource": "ai-journal",
          ":updatedAt": now,
        },
      }),
    );
  } catch (err) {
    if (err instanceof Error && err.name === "ConditionalCheckFailedException") return;
    throw err;
  }
}

async function writeAiExpense(
  userId: string,
  date: string,
  expense: { category: Expense["category"]; amount?: number; note?: string },
): Promise<void> {
  const now = new Date().toISOString();
  const item: Expense = {
    userId,
    expenseId: randomUUID(),
    category: expense.category,
    amount: expense.amount ?? 0,
    note: expense.note,
    date,
    source: "ai-journal",
    createdAt: now,
    updatedAt: now,
  };
  await ddb.send(new PutCommand({ TableName: process.env.EXPENSES_TABLE_NAME, Item: item }));
}

// Sleep/weight/mood/cycle are naturally one-value-per-day concepts, so AI writes target the
// same deterministic logId a manual save for that day would use (see SINGULAR_LOG_TYPES) —
// re-extraction updates that one item, and a ConditionExpression below refuses to clobber a
// manual entry, mirroring writeAiHabitLog's manual-always-wins guarantee. Food/call/expense
// are naturally multi-per-day, so each mention gets its own new entry.
async function writeAiLogEntry(
  userId: string,
  date: string,
  logType: LogType,
  data: Record<string, unknown>,
): Promise<void> {
  const parsed = LOG_ENTRY_SCHEMAS[logType].safeParse(data);
  if (!parsed.success) {
    console.error(`Skipping invalid AI-extracted ${logType} entry:`, parsed.error.message);
    return;
  }
  const now = new Date().toISOString();

  if (!SINGULAR_LOG_TYPES.includes(logType)) {
    const entry: LogEntry = {
      userId,
      logId: randomUUID(),
      logType,
      date,
      data: parsed.data as Record<string, unknown>,
      source: "ai-journal",
      createdAt: now,
      updatedAt: now,
    };
    await ddb.send(new PutCommand({ TableName: process.env.LOG_ENTRIES_TABLE_NAME, Item: entry }));
    return;
  }

  // Sleep can be extracted a field at a time (e.g. a journal entry mentioning only a wake
  // time), so merge onto any existing AI-written data instead of overwriting the whole record
  // — otherwise a later wake-time-only mention would erase a bedTime recorded earlier that day.
  let mergedData: Record<string, unknown> = parsed.data as Record<string, unknown>;
  if (logType === "sleep") {
    const existing = await ddb.send(
      new GetCommand({
        TableName: process.env.LOG_ENTRIES_TABLE_NAME,
        Key: { userId, logId: `${date}-${logType}` },
      }),
    );
    const existingEntry = existing.Item as LogEntry | undefined;
    if (existingEntry && existingEntry.source !== "ai-journal") return; // manual entry wins
    mergedData = { ...(existingEntry?.data ?? {}), ...mergedData };
  }

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: process.env.LOG_ENTRIES_TABLE_NAME,
        Key: { userId, logId: `${date}-${logType}` },
        UpdateExpression:
          "SET #date = :date, #logType = :logType, #data = :data, #source = :source, " +
          "updatedAt = :updatedAt, createdAt = if_not_exists(createdAt, :updatedAt)",
        ConditionExpression: "attribute_not_exists(logId) OR #source = :aiSource",
        ExpressionAttributeNames: {
          "#date": "date",
          "#logType": "logType",
          "#data": "data",
          "#source": "source",
        },
        ExpressionAttributeValues: {
          ":date": date,
          ":logType": logType,
          ":data": mergedData,
          ":source": "ai-journal",
          ":aiSource": "ai-journal",
          ":updatedAt": now,
        },
      }),
    );
  } catch (err) {
    // A manual entry already exists for this date+logType — manual always wins, no exceptions.
    if (err instanceof Error && err.name === "ConditionalCheckFailedException") return;
    throw err;
  }
}

// Food/call entries are naturally multi-per-day, so each extraction run writes a fresh item per
// mention rather than updating one deterministic record (see writeAiLogEntry). That means
// re-extracting the same day's journal text on every edit/re-save would otherwise pile up
// duplicates of the same mentions instead of replacing them, so the previous AI-written batch
// for this date is cleared first. Manual entries (source !== "ai-journal") are never touched.
async function clearPreviousAiJournalEntries(userId: string, date: string): Promise<void> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.LOG_ENTRIES_TABLE_NAME,
      KeyConditionExpression: "userId = :userId",
      FilterExpression: "#date = :date AND #source = :source AND #logType IN (:food, :call)",
      ExpressionAttributeNames: { "#date": "date", "#source": "source", "#logType": "logType" },
      ExpressionAttributeValues: {
        ":userId": userId,
        ":date": date,
        ":source": "ai-journal",
        ":food": "food",
        ":call": "call",
      },
    }),
  );
  const items = (result.Items ?? []) as LogEntry[];
  await Promise.all(
    items.map((item) =>
      ddb.send(
        new DeleteCommand({
          TableName: process.env.LOG_ENTRIES_TABLE_NAME,
          Key: { userId, logId: item.logId },
        }),
      ),
    ),
  );
}

// Same idea as clearPreviousAiJournalEntries, but for the dedicated Expenses table — expenses
// are also naturally multi-per-day and now live outside LogEntriesTable.
async function clearPreviousAiExpenses(userId: string, date: string): Promise<void> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.EXPENSES_TABLE_NAME,
      KeyConditionExpression: "userId = :userId",
      FilterExpression: "#date = :date AND #source = :source",
      ExpressionAttributeNames: { "#date": "date", "#source": "source" },
      ExpressionAttributeValues: { ":userId": userId, ":date": date, ":source": "ai-journal" },
    }),
  );
  const items = (result.Items ?? []) as Expense[];
  await Promise.all(
    items.map((item) =>
      ddb.send(
        new DeleteCommand({
          TableName: process.env.EXPENSES_TABLE_NAME,
          Key: { userId, expenseId: item.expenseId },
        }),
      ),
    ),
  );
}

async function fetchActiveMedications(userId: string): Promise<Medication[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.MEDICATIONS_TABLE_NAME,
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": userId },
    }),
  );
  const today = new Date().toISOString().slice(0, 10);
  return ((result.Items ?? []) as Medication[]).filter(
    (m) => today >= m.startDate && today <= computeEndDate(m.startDate, m.durationDays),
  );
}

async function fetchRoutineTemplates(userId: string): Promise<RoutineTemplate[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.ROUTINE_TEMPLATES_TABLE_NAME,
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": userId },
    }),
  );
  return (result.Items ?? []) as RoutineTemplate[];
}

async function fetchHeightCm(userId: string): Promise<number | undefined> {
  const result = await ddb.send(
    new GetCommand({ TableName: process.env.USER_PROFILE_TABLE_NAME, Key: { userId } }),
  );
  return (result.Item as { heightCm?: number } | undefined)?.heightCm;
}

// Average walking stride length as a fraction of height (a commonly cited approximation,
// not medically precise) — used only when the journal mentions a distance instead of an
// explicit step count. Falls back to an average adult height when the user hasn't set one.
const STRIDE_LENGTH_FACTOR = 0.415;
const DEFAULT_HEIGHT_CM = 170;

function stepsFromDistance(distanceKm: number, heightCm: number | undefined): number {
  const strideMeters = ((heightCm ?? DEFAULT_HEIGHT_CM) * STRIDE_LENGTH_FACTOR) / 100;
  return Math.round((distanceKm * 1000) / strideMeters);
}

// Best-effort: extracts everything mentioned in journal text (habits, food, sleep, weight,
// mood, medications, routine steps, cycle events, calls, expenses) and fans it out to the
// right tables (manual entries always win), and never throws — a failure here must never
// block the journal entry itself from saving.
export async function applyJournalExtraction(
  userId: string,
  date: string,
  text: string,
): Promise<JournalEntry["aiExtracted"] | undefined> {
  try {
    const [medications, routines, heightCm] = await Promise.all([
      fetchActiveMedications(userId),
      fetchRoutineTemplates(userId),
      fetchHeightCm(userId),
    ]);

    const routineStepRefs = routines.flatMap((r) =>
      r.steps.map((step, stepIndex) => ({ routineId: r.routineId, stepIndex, text: step })),
    );

    const extraction = await extractJournalInfo(
      text,
      medications.map((m) => m.name),
      routineStepRefs.map((s) => s.text),
    );

    // The model reports raw distance rather than estimating steps itself (LLM arithmetic
    // isn't reliable) — steps are derived here from the user's height so the ledger and the
    // written habit log agree on the same number.
    if (extraction.stepsCount === null && extraction.distanceKm !== null) {
      extraction.stepsCount = stepsFromDistance(extraction.distanceKm, heightCm);
    }

    await ddb.send(
      new UpdateCommand({
        TableName: process.env.JOURNAL_TABLE_NAME,
        Key: { userId, date },
        UpdateExpression: "SET aiExtracted = :aiExtracted",
        ExpressionAttributeValues: { ":aiExtracted": extraction },
      }),
    );

    await Promise.all([clearPreviousAiJournalEntries(userId, date), clearPreviousAiExpenses(userId, date)]);

    const writes: Promise<void>[] = [];

    if (extraction.waterMl !== null) {
      writes.push(writeAiHabitLog(userId, date, "water", extraction.waterMl));
    }
    if (extraction.exerciseMinutes !== null) {
      writes.push(writeAiHabitLog(userId, date, "exercise", extraction.exerciseMinutes));
    }
    if (extraction.stepsCount !== null) {
      writes.push(writeAiHabitLog(userId, date, "steps", extraction.stepsCount));
    }
    if (extraction.food !== null) {
      writes.push(
        writeAiLogEntry(userId, date, "food", {
          description: extraction.food.description,
          mealType: extraction.food.mealType ?? undefined,
        }),
      );
    }
    if (extraction.sleep !== null) {
      writes.push(
        writeAiLogEntry(userId, date, "sleep", {
          bedTime: extraction.sleep.bedTime ?? undefined,
          wakeTime: extraction.sleep.wakeTime ?? undefined,
        }),
      );
    }
    if (extraction.weightKg !== null) {
      writes.push(writeAiLogEntry(userId, date, "weight", { valueKg: extraction.weightKg }));
    }
    if (extraction.moodRating !== null) {
      writes.push(writeAiLogEntry(userId, date, "mood", { rating: extraction.moodRating }));
    }
    if (extraction.cycleEvent !== null) {
      writes.push(writeAiLogEntry(userId, date, "cycle", { event: extraction.cycleEvent }));
    }
    for (const call of extraction.calls) {
      writes.push(
        writeAiLogEntry(userId, date, "call", {
          personName: call.personName,
          durationMinutes: call.durationMinutes ?? undefined,
          note: call.note ?? undefined,
        }),
      );
    }
    for (const expense of extraction.expenses) {
      writes.push(
        writeAiExpense(userId, date, {
          category: expense.category as Expense["category"],
          amount: expense.amount ?? undefined,
          note: expense.note ?? undefined,
        }),
      );
    }

    for (const name of extraction.medicationNamesTaken) {
      const match = medications.find((m) => m.name.toLowerCase() === name.toLowerCase());
      if (match) writes.push(writeAiMedicationLog(userId, date, match.medicationId));
    }
    for (const stepText of extraction.routineStepsCompleted) {
      const match = routineStepRefs.find((s) => s.text.toLowerCase() === stepText.toLowerCase());
      if (match) writes.push(writeAiRoutineStepLog(userId, date, match.routineId, match.stepIndex));
    }

    await Promise.all(writes);

    return extraction;
  } catch (err) {
    console.error("Journal auto-extraction failed (non-blocking):", err);
    return undefined;
  }
}
