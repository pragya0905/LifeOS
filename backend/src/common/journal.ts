import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "./dynamo";
import { extractHabitsFromJournal } from "./claude";
import type { HabitType, JournalEntry } from "./types";

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

// Best-effort: extracts habit mentions from journal text, persists them onto the
// entry and into HabitLogsTable (manual entries always win), and never throws —
// a failure here must never block the journal entry itself from saving.
export async function applyHabitExtraction(
  userId: string,
  date: string,
  text: string,
): Promise<JournalEntry["aiExtracted"] | undefined> {
  try {
    const extraction = await extractHabitsFromJournal(text);

    await ddb.send(
      new UpdateCommand({
        TableName: process.env.JOURNAL_TABLE_NAME,
        Key: { userId, date },
        UpdateExpression: "SET aiExtracted = :aiExtracted",
        ExpressionAttributeValues: { ":aiExtracted": extraction },
      }),
    );

    for (const habitType of HABIT_TYPES) {
      const value = extraction[habitType];
      if (value === "unclear") continue;
      await writeAiHabitLog(userId, date, habitType, value);
    }

    return extraction;
  } catch (err) {
    console.error("Habit auto-extraction failed (non-blocking):", err);
    return undefined;
  }
}
