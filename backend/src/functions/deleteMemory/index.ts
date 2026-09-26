import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const memoryId = event.pathParameters?.id;
  if (!memoryId) return errorResponse(400, "Missing memory id");

  await ddb.send(
    new DeleteCommand({ TableName: process.env.USER_MEMORY_TABLE_NAME, Key: { userId, memoryId } }),
  );

  return jsonResponse(200, { deleted: true });
};
