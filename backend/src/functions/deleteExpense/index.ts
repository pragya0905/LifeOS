import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const expenseId = event.pathParameters?.id;
  if (!expenseId) return errorResponse(400, "Missing expense id");

  await ddb.send(
    new DeleteCommand({ TableName: process.env.EXPENSES_TABLE_NAME, Key: { userId, expenseId } }),
  );

  return jsonResponse(200, { deleted: true });
};
