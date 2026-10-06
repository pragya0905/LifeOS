import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse } from "../../common/http";

// Small per-user table (at most 7 days x 4 meal types = 28 rows) — no pagination or date
// range needed, unlike listMealPlanRange which deals with an unbounded number of dates.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);

  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.MEAL_PLAN_TEMPLATES_TABLE_NAME,
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": userId },
    }),
  );

  return jsonResponse(200, { templates: result.Items ?? [] });
};
