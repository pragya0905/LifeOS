import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Lets a client fetch a whole week of meal plan slots in one query — same pattern as
// listHabitsForRange, which this mirrors.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const from = event.queryStringParameters?.from ?? "";
  const to = event.queryStringParameters?.to ?? "";

  if (!DATE_RE.test(from)) return errorResponse(400, "from is required, format YYYY-MM-DD");
  if (!DATE_RE.test(to)) return errorResponse(400, "to is required, format YYYY-MM-DD");

  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.MEAL_PLAN_TABLE_NAME,
      KeyConditionExpression: "userId = :userId AND dateMealType BETWEEN :from AND :to",
      ExpressionAttributeValues: {
        ":userId": userId,
        ":from": from,
        ":to": `${to}#￿`,
      },
    }),
  );

  return jsonResponse(200, { slots: result.Items ?? [] });
};
