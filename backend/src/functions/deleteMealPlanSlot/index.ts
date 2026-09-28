import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const date = event.pathParameters?.date ?? "";
  const mealType = event.pathParameters?.mealType;

  if (!DATE_RE.test(date)) return errorResponse(400, "date must be YYYY-MM-DD");
  if (!mealType) return errorResponse(400, "Missing meal type");

  await ddb.send(
    new DeleteCommand({
      TableName: process.env.MEAL_PLAN_TABLE_NAME,
      Key: { userId, dateMealType: `${date}#${mealType}` },
    }),
  );

  return jsonResponse(200, { deleted: true });
};
