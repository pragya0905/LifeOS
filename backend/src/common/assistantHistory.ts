import type { QueryCommandInput } from "@aws-sdk/lib-dynamodb";

// Every turn of one conversation, in order. Strongly consistent on purpose: a reopen or a
// follow-up sent right after a reply must see the turns that were just written. A default
// (eventually consistent) read can return nothing, which the client shows as a failed load.
// Base-table query only: ConsistentRead is not supported on a GSI, and this table has none.
export function conversationTurnsQuery(userId: string, conversationId: string): QueryCommandInput {
  return {
    TableName: process.env.ASSISTANT_CONVERSATIONS_TABLE_NAME,
    KeyConditionExpression: "userId = :userId AND begins_with(conversationTurn, :prefix)",
    ExpressionAttributeValues: { ":userId": userId, ":prefix": `${conversationId}#` },
    ConsistentRead: true,
  };
}
