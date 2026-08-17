import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Mirrors listHabitsForRange — lets a client fetch several days of medication logs in
// one query instead of one request per day, used for adherence stats.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const from = event.queryStringParameters?.from ?? "";
  const to = event.queryStringParameters?.to ?? "";

  if (!DATE_RE.test(from)) return errorResponse(400, "from is required, format YYYY-MM-DD");
  if (!DATE_RE.test(to)) return errorResponse(400, "to is required, format YYYY-MM-DD");

  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.MEDICATION_LOGS_TABLE_NAME,
      KeyConditionExpression: "userId = :userId AND dateMedicationId BETWEEN :from AND :to",
      ExpressionAttributeValues: {
        ":userId": userId,
        ":from": from,
        ":to": `${to}#￿`,
      },
    }),
  );

  return jsonResponse(200, { logs: result.Items ?? [] });
};
