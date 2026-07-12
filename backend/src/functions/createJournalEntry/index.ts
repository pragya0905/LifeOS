import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import { extractHabitsFromJournal } from "../../common/claude";
import type { HabitType, JournalEntry } from "../../common/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HABIT_TYPES: HabitType[] = ["water", "exercise", "medicine"];

async function writeAiHabitLog(
  userId: string,
  date: string,
  habitType: HabitType,
  status: "done" | "missed",
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: process.env.HABITS_TABLE_NAME,
        Key: { userId, dateHabitType: `${date}#${habitType}` },
        UpdateExpression:
          "SET #date = :date, #habitType = :habitType, #status = :status, #source = :source, " +
          "updatedAt = :updatedAt, createdAt = if_not_exists(createdAt, :updatedAt)",
        ConditionExpression: "attribute_not_exists(dateHabitType) OR #source = :aiSource",
        ExpressionAttributeNames: {
          "#date": "date",
          "#habitType": "habitType",
          "#status": "status",
          "#source": "source",
        },
        ExpressionAttributeValues: {
          ":date": date,
          ":habitType": habitType,
          ":status": status,
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

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const date = typeof body.date === "string" ? body.date : "";
  if (!DATE_RE.test(date)) return errorResponse(400, "date is required, format YYYY-MM-DD");

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return errorResponse(400, "text is required");

  const now = new Date().toISOString();
  const entry: JournalEntry = {
    userId,
    entryId: randomUUID(),
    date,
    text,
    voiceInput: body.voiceInput === true,
    createdAt: now,
    updatedAt: now,
  };

  await ddb.send(
    new PutCommand({
      TableName: process.env.JOURNAL_TABLE_NAME,
      Item: entry,
    }),
  );

  // Habit auto-extraction is best-effort: it never blocks or fails the journal save.
  try {
    const extraction = await extractHabitsFromJournal(text);
    entry.aiExtracted = extraction;

    await ddb.send(
      new UpdateCommand({
        TableName: process.env.JOURNAL_TABLE_NAME,
        Key: { userId, entryId: entry.entryId },
        UpdateExpression: "SET aiExtracted = :aiExtracted",
        ExpressionAttributeValues: { ":aiExtracted": extraction },
      }),
    );

    for (const habitType of HABIT_TYPES) {
      const value = extraction[habitType];
      if (value === "unclear") continue;
      await writeAiHabitLog(userId, date, habitType, value);
    }
  } catch (err) {
    console.error("Habit auto-extraction failed (non-blocking):", err);
  }

  return jsonResponse(201, entry);
};
