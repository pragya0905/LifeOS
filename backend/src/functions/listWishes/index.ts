import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse } from "../../common/http";
import type { HabitLog, Wish } from "../../common/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// habit_linked progress is computed live from actual habit logs since the wish was
// created, rather than stored and kept in sync by hand — it can never go stale.
async function computeHabitLinkedProgress(userId: string, wish: Wish): Promise<number | null> {
  if (wish.progressMode !== "habit_linked" || !wish.linkedHabitType || !wish.habitLinkTargetValue) {
    return null;
  }
  const from = wish.createdAt.slice(0, 10);
  const to = today();
  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.HABITS_TABLE_NAME,
      KeyConditionExpression: "userId = :userId AND dateHabitType BETWEEN :from AND :to",
      ExpressionAttributeValues: { ":userId": userId, ":from": from, ":to": `${to}#￿` },
    }),
  );
  const habits = (result.Items ?? []) as HabitLog[];
  const total = habits
    .filter((h) => h.habitType === wish.linkedHabitType)
    .reduce((sum, h) => sum + (h.value ?? 0), 0);
  return Math.min(Math.round((total / wish.habitLinkTargetValue) * 100), 100);
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

  const enriched = await Promise.all(
    wishes.map(async (wish) => ({
      ...wish,
      habitLinkedProgress: await computeHabitLinkedProgress(userId, wish),
    })),
  );

  return jsonResponse(200, { wishes: enriched });
};
