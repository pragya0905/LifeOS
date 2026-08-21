import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse } from "../../common/http";
import type { HabitLog, Wish } from "../../common/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function isHabitLinked(wish: Wish): boolean {
  return wish.progressMode === "habit_linked" && !!wish.linkedHabitType && !!wish.habitLinkTargetValue;
}

// habit_linked progress is computed live from actual habit logs since the wish was
// created, rather than stored and kept in sync by hand — it can never go stale.
// One QueryCommand covers every habit-linked wish (from the earliest wish's creation date
// to today), then each wish's progress is computed in-memory against that single result
// set, instead of running a separate HabitsTable query per wish.
async function computeHabitLinkedProgress(userId: string, wishes: Wish[]): Promise<Map<string, number>> {
  const linkedWishes = wishes.filter(isHabitLinked);
  const progress = new Map<string, number>();
  if (linkedWishes.length === 0) return progress;

  const earliestFrom = linkedWishes
    .map((w) => w.createdAt.slice(0, 10))
    .reduce((min, d) => (d < min ? d : min));
  const to = today();
  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.HABITS_TABLE_NAME,
      KeyConditionExpression: "userId = :userId AND dateHabitType BETWEEN :from AND :to",
      ExpressionAttributeValues: { ":userId": userId, ":from": earliestFrom, ":to": `${to}#￿` },
    }),
  );
  const habits = (result.Items ?? []) as HabitLog[];

  for (const wish of linkedWishes) {
    const from = wish.createdAt.slice(0, 10);
    const total = habits
      .filter((h) => h.habitType === wish.linkedHabitType && h.date >= from)
      .reduce((sum, h) => sum + (h.value ?? 0), 0);
    progress.set(wish.wishId, Math.min(Math.round((total / wish.habitLinkTargetValue!) * 100), 100));
  }
  return progress;
}

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);

  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.WISHES_TABLE_NAME,
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": userId },
    }),
  );
  const wishes = (result.Items ?? []) as Wish[];

  const progressByWishId = await computeHabitLinkedProgress(userId, wishes);
  const enriched = wishes.map((wish) => ({
    ...wish,
    habitLinkedProgress: progressByWishId.get(wish.wishId) ?? null,
  }));

  return jsonResponse(200, { wishes: enriched });
};
