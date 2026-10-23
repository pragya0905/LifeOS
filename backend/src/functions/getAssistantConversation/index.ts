import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import { conversationTurnsQuery } from "../../common/assistantHistory";

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const conversationId = event.pathParameters?.id;
  if (!conversationId) return errorResponse(400, "Missing conversation id");

  const result = await ddb.send(new QueryCommand(conversationTurnsQuery(userId, conversationId)));

  return jsonResponse(200, { turns: result.Items ?? [] });
};
