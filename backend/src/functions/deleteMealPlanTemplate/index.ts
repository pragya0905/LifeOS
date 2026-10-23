import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const dayOfWeek = Number(event.pathParameters?.day);
  const mealType = event.pathParameters?.mealType;

  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return errorResponse(400, "day must be an integer 0-6 (0=Sun..6=Sat)");
  }
  if (!mealType) return errorResponse(400, "Missing meal type");

  // ReturnValues ALL_OLD: the removed item comes back only if one existed.
  const removed = await ddb.send(
    new DeleteCommand({
      TableName: process.env.MEAL_PLAN_TEMPLATES_TABLE_NAME,
      Key: { userId, dayMealType: `${dayOfWeek}#${mealType}` },
      ReturnValues: "ALL_OLD",
    }),
  );

  return jsonResponse(200, { deleted: removed.Attributes !== undefined });
};
