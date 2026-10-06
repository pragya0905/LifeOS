import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse } from "../../common/http";
import {
  BADGE_DEFINITIONS,
  computeEligibleBadgeKeys,
  countDoneTasks,
  countJournalEntries,
  countMedicationLogsTaken,
  countRoutineLogsDone,
} from "../../common/achievements";
import type {
  Achievement,
  HabitLog,
  JournalEntry,
  MedicationLog,
  RoutineStepLog,
  Task,
  Wish,
} from "../../common/types";

async function queryAll<T>(tableName: string | undefined, userId: string): Promise<T[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": userId },
    }),
  );
  return (result.Items ?? []) as T[];
}

// Lazily evaluates and permanently records badge unlocks on every call — there's no separate
// trigger wired into every write path across the app. A badge already in AchievementsTable is
// never re-checked or revoked; only newly-eligible ones get written (and flagged justUnlocked
// so the UI can celebrate exactly once). "Earned on" reflects whenever this endpoint first
// noticed the threshold was crossed, not necessarily the exact historical moment — close enough
// at personal-app usage scale, since this runs every time the Achievements view loads.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);

  const [tasks, journalEntries, habitLogs, routineLogs, medicationLogs, wishes, existing] = await Promise.all([
    queryAll<Task>(process.env.TASKS_TABLE_NAME, userId),
    queryAll<JournalEntry>(process.env.JOURNAL_TABLE_NAME, userId),
    queryAll<HabitLog>(process.env.HABITS_TABLE_NAME, userId),
    queryAll<RoutineStepLog>(process.env.ROUTINE_LOGS_TABLE_NAME, userId),
    queryAll<MedicationLog>(process.env.MEDICATION_LOGS_TABLE_NAME, userId),
    queryAll<Wish>(process.env.WISHES_TABLE_NAME, userId),
    queryAll<Achievement>(process.env.ACHIEVEMENTS_TABLE_NAME, userId),
  ]);

  const eligible = computeEligibleBadgeKeys({
    doneTasks: countDoneTasks(tasks),
    journalEntries: countJournalEntries(journalEntries),
    habitLogs,
    routineLogsDone: countRoutineLogsDone(routineLogs),
    medicationLogsTaken: countMedicationLogsTaken(medicationLogs),
    wishes,
  });

  const existingByKey = new Map(existing.map((a) => [a.badgeKey, a]));
  const now = new Date().toISOString();
  const newlyUnlocked: string[] = [];

  await Promise.all(
    [...eligible].map(async (badgeKey) => {
      if (existingByKey.has(badgeKey)) return;
      newlyUnlocked.push(badgeKey);
      await ddb.send(
        new PutCommand({
          TableName: process.env.ACHIEVEMENTS_TABLE_NAME,
          Item: { userId, badgeKey, earnedAt: now } satisfies Achievement,
        }),
      );
    }),
  );

  const badges = BADGE_DEFINITIONS.map((def) => {
    const earnedAt = existingByKey.get(def.key)?.earnedAt ?? (newlyUnlocked.includes(def.key) ? now : null);
    return { ...def, earnedAt, justUnlocked: newlyUnlocked.includes(def.key) };
  });

  return jsonResponse(200, { badges });
};
