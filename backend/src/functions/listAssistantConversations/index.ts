import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse } from "../../common/http";
import type { AssistantConversationTurn } from "../../common/types";

const PREVIEW_LENGTH = 80;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);

  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.ASSISTANT_CONVERSATIONS_TABLE_NAME,
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": userId },
    }),
  );
  const items = (result.Items ?? []) as AssistantConversationTurn[];

  // conversationTurn sorts each conversation's own turns chronologically, but different
  // conversationIds (UUIDs) don't sort relative to each other by recency — group first, then
  // sort the groups themselves by their most recent turn.
  const grouped = new Map<string, AssistantConversationTurn[]>();
  for (const item of items) {
    const list = grouped.get(item.conversationId) ?? [];
    list.push(item);
    grouped.set(item.conversationId, list);
  }

  const conversations = Array.from(grouped.entries())
    .map(([conversationId, turns]) => {
      turns.sort((a, b) => a.conversationTurn.localeCompare(b.conversationTurn));
      const firstUserTurn = turns.find((t) => t.role === "user") ?? turns[0];
      const preview =
        firstUserTurn.content.length > PREVIEW_LENGTH
          ? `${firstUserTurn.content.slice(0, PREVIEW_LENGTH).trimEnd()}…`
          : firstUserTurn.content;
      return {
        conversationId,
        preview,
        lastMessageAt: turns[turns.length - 1].createdAt,
      };
    })
    .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));

  return jsonResponse(200, { conversations });
};
