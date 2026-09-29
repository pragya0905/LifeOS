import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import type { AssistantConversationTurn } from "../../common/types";

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const conversationId = event.pathParameters?.id;
  if (!conversationId) return errorResponse(400, "Missing conversation id");

  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.ASSISTANT_CONVERSATIONS_TABLE_NAME,
      KeyConditionExpression: "userId = :userId AND begins_with(conversationTurn, :prefix)",
      ExpressionAttributeValues: { ":userId": userId, ":prefix": `${conversationId}#` },
    }),
  );
  const items = (result.Items ?? []) as AssistantConversationTurn[];

  await Promise.all(
    items.map((item) =>
      ddb.send(
        new DeleteCommand({
          TableName: process.env.ASSISTANT_CONVERSATIONS_TABLE_NAME,
          Key: { userId, conversationTurn: item.conversationTurn },
        }),
      ),
    ),
  );

  return jsonResponse(200, { deleted: true });
};
