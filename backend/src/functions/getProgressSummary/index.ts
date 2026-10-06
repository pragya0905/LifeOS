import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse } from "../../common/http";
import { summarizeBudgets, summarizeHabits, summarizeWishes, type WishWithProgress } from "../../common/progressSummary";
import type { Budget, Expense, HabitLog, Wish } from "../../common/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function isHabitLinked(wish: Wish): boolean {
  return wish.progressMode === "habit_linked" && !!wish.linkedHabitType && !!wish.habitLinkTargetValue;
}

// Same enrichment listWishes does — habit_linked progress is computed live from actual habit
// logs rather than stored, so it can never go stale.
async function computeHabitLinkedProgress(userId: string, wishes: Wish[]): Promise<Map<string, number>> {
  const linkedWishes = wishes.filter(isHabitLinked);
  const progress = new Map<string, number>();
  if (linkedWishes.length === 0) return progress;

  const earliestFrom = linkedWishes.map((w) => w.createdAt.slice(0, 10)).reduce((min, d) => (d < min ? d : min));
  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.HABITS_TABLE_NAME,
      KeyConditionExpression: "userId = :userId AND dateHabitType BETWEEN :from AND :to",
      ExpressionAttributeValues: { ":userId": userId, ":from": earliestFrom, ":to": `${today()}#￿` },
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

// Direct-DynamoDB counterpart to chatAssistant's HTTP-forwarding computeProgressSummary —
// this Lambda IS an HttpApi route itself, and self-referencing its own HttpApi's invoke URL
// turned out to be a genuine CloudFormation circular dependency (confirmed by a failed
// deploy), so it queries each table directly instead, same as every other HttpApi Lambda.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const now = new Date();
  const todayStr = today();
  const monthStart = `${todayStr.slice(0, 7)}-01`;
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [wishesResult, habitsResult, budgetsResult, expensesResult] = await Promise.all([
    ddb.send(
      new QueryCommand({
        TableName: process.env.WISHES_TABLE_NAME,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
      }),
    ),
    ddb.send(
      new QueryCommand({
        TableName: process.env.HABITS_TABLE_NAME,
        KeyConditionExpression: "userId = :userId AND dateHabitType BETWEEN :from AND :to",
        ExpressionAttributeValues: { ":userId": userId, ":from": thirtyDaysAgo, ":to": `${todayStr}#￿` },
      }),
    ),
    ddb.send(
      new QueryCommand({
        TableName: process.env.BUDGETS_TABLE_NAME,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
      }),
    ),
    ddb.send(
      new QueryCommand({
        TableName: process.env.EXPENSES_TABLE_NAME,
        KeyConditionExpression: "userId = :userId",
        FilterExpression: "#date BETWEEN :from AND :to",
        ExpressionAttributeNames: { "#date": "date" },
        ExpressionAttributeValues: { ":userId": userId, ":from": monthStart, ":to": todayStr },
      }),
    ),
  ]);

  const wishes = (wishesResult.Items ?? []) as Wish[];
  const progressByWishId = await computeHabitLinkedProgress(userId, wishes);
  const wishesWithProgress: WishWithProgress[] = wishes.map((wish) => ({
    ...wish,
    habitLinkedProgress: progressByWishId.get(wish.wishId) ?? null,
  }));

  const habitLogs = (habitsResult.Items ?? []) as HabitLog[];
  const budgets = (budgetsResult.Items ?? []) as Budget[];
  const expenses = (expensesResult.Items ?? []) as Expense[];

  return jsonResponse(200, {
    todaysDate: todayStr,
    wishes: summarizeWishes(wishesWithProgress, now),
    habits: summarizeHabits(habitLogs, now),
    budgets: summarizeBudgets(budgets, expenses, now),
  });
};
