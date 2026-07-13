import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const date = event.pathParameters?.date ?? "";
  if (!DATE_RE.test(date)) return errorResponse(400, "date must be YYYY-MM-DD");

  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.MEDICATION_LOGS_TABLE_NAME,
      KeyConditionExpression: "userId = :userId AND begins_with(dateMedicationId, :prefix)",
      ExpressionAttributeValues: {
        ":userId": userId,
        ":prefix": `${date}#`,
      },
    }),
  );

  return jsonResponse(200, { logs: result.Items ?? [] });
};
