import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const endpoint = event.queryStringParameters?.endpoint;
  if (!endpoint) return errorResponse(400, "endpoint query parameter is required");

  await ddb.send(
    new DeleteCommand({
      TableName: process.env.PUSH_SUBSCRIPTIONS_TABLE_NAME,
      Key: { userId, endpoint },
    }),
  );

  return jsonResponse(200, { deleted: true });
};
