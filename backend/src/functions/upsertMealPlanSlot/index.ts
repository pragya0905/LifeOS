import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import type { MealType } from "../../common/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const date = event.pathParameters?.date ?? "";
  const mealType = event.pathParameters?.mealType ?? "";

  if (!DATE_RE.test(date)) return errorResponse(400, "date must be YYYY-MM-DD");
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
  if (!text) return errorResponse(400, "text is required — use DELETE to clear a slot instead");

  const now = new Date().toISOString();
  const result = await ddb.send(
    new UpdateCommand({
      TableName: process.env.MEAL_PLAN_TABLE_NAME,
      Key: { userId, dateMealType: `${date}#${mealType}` },
      UpdateExpression:
        "SET #date = :date, #mealType = :mealType, #text = :text, updatedAt = :updatedAt, " +
        "createdAt = if_not_exists(createdAt, :updatedAt)",
      ExpressionAttributeNames: { "#date": "date", "#mealType": "mealType", "#text": "text" },
      ExpressionAttributeValues: {
        ":date": date,
        ":mealType": mealType,
        ":text": text,
        ":updatedAt": now,
      },
      ReturnValues: "ALL_NEW",
    }),
  );

  return jsonResponse(200, result.Attributes);
};
