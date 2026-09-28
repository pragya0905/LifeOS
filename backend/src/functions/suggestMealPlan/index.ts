import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import { suggestMealPlan } from "../../common/claude";
import type { MealPlanSlot, MealType } from "../../common/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const from = typeof body.from === "string" ? body.from : "";
  const to = typeof body.to === "string" ? body.to : "";
  if (!DATE_RE.test(from)) return errorResponse(400, "from is required, format YYYY-MM-DD");
  if (!DATE_RE.test(to)) return errorResponse(400, "to is required, format YYYY-MM-DD");

  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.MEAL_PLAN_TABLE_NAME,
      KeyConditionExpression: "userId = :userId AND dateMealType BETWEEN :from AND :to",
      ExpressionAttributeValues: { ":userId": userId, ":from": from, ":to": `${to}#￿` },
    }),
  );
  const existing = (result.Items ?? []) as MealPlanSlot[];
  const existingKeys = new Set(existing.map((s) => `${s.date}#${s.mealType}`));

  const emptySlots = dateRange(from, to).flatMap((date) =>
    MEAL_TYPES.filter((mealType) => !existingKeys.has(`${date}#${mealType}`)).map((mealType) => ({
      date,
      mealType,
    })),
  );

  if (emptySlots.length === 0) {
    return jsonResponse(200, { slots: [] });
  }

  const suggestion = await suggestMealPlan(
    emptySlots,
    existing.map((s) => ({ date: s.date, mealType: s.mealType, text: s.text })),
  );

  return jsonResponse(200, suggestion);
};
