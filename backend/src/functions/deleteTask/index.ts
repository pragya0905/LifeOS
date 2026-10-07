import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const taskId = event.pathParameters?.id;
  if (!taskId) return errorResponse(400, "Missing task id");

  await ddb.send(new DeleteCommand({ TableName: process.env.TASKS_TABLE_NAME, Key: { userId, taskId } }));

  return jsonResponse(200, { deleted: true });
};
