import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "./dynamo";
import { extractHabitsFromJournal } from "./claude";
import type { HabitType, HabitUnit, JournalEntry } from "./types";

const HABIT_UNIT: Record<HabitType, HabitUnit> = {
  water: "ml",
  exercise: "minutes",
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

// Best-effort: extracts habit quantities mentioned in journal text, persists them onto
// the entry and into HabitLogsTable (manual entries always win), and never throws — a
// failure here must never block the journal entry itself from saving.
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

    if (extraction.waterMl !== null) {
      await writeAiHabitLog(userId, date, "water", extraction.waterMl);
    }
    if (extraction.exerciseMinutes !== null) {
      await writeAiHabitLog(userId, date, "exercise", extraction.exerciseMinutes);
    }

    return extraction;
  } catch (err) {
    console.error("Habit auto-extraction failed (non-blocking):", err);
    return undefined;
  }
}
