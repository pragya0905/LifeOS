import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const category = event.pathParameters?.category;
  if (!category) return errorResponse(400, "Missing category");

  // ReturnValues ALL_OLD: the removed item comes back only if one existed.
  const removed = await ddb.send(
    new DeleteCommand({ TableName: process.env.BUDGETS_TABLE_NAME, Key: { userId, category }, ReturnValues: "ALL_OLD" }),
  );

  return jsonResponse(200, { deleted: removed.Attributes !== undefined });
};
