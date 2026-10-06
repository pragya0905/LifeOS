import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import type { MealType } from "../../common/types";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

// Same upsert-by-composite-key pattern as upsertMealPlanSlot, but keyed by day-of-week
// (0=Sun..6=Sat) instead of an exact date — this is the recurring default a specific
// date's slot can override, not a record of what was actually eaten.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const dayOfWeek = Number(event.pathParameters?.day);
  const mealType = event.pathParameters?.mealType ?? "";

  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return errorResponse(400, "day must be an integer 0-6 (0=Sun..6=Sat)");
  }
  if (!MEAL_TYPES.includes(mealType as MealType)) {
    return errorResponse(400, `mealType must be one of ${MEAL_TYPES.join(", ")}`);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return errorResponse(400, "text is required — use DELETE to clear a template instead");

  const now = new Date().toISOString();
  const result = await ddb.send(
    new UpdateCommand({
      TableName: process.env.MEAL_PLAN_TEMPLATES_TABLE_NAME,
      Key: { userId, dayMealType: `${dayOfWeek}#${mealType}` },
      UpdateExpression:
        "SET dayOfWeek = :dayOfWeek, #mealType = :mealType, #text = :text, updatedAt = :updatedAt, " +
        "createdAt = if_not_exists(createdAt, :updatedAt)",
      ExpressionAttributeNames: { "#mealType": "mealType", "#text": "text" },
      ExpressionAttributeValues: {
        ":dayOfWeek": dayOfWeek,
        ":mealType": mealType,
        ":text": text,
        ":updatedAt": now,
      },
      ReturnValues: "ALL_NEW",
    }),
  );

  return jsonResponse(200, result.Attributes);
};
