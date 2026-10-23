import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { conversationTurnsQuery } from "./assistantHistory";

describe("conversationTurnsQuery", () => {
  const originalTable = process.env.ASSISTANT_CONVERSATIONS_TABLE_NAME;

  beforeEach(() => {
    process.env.ASSISTANT_CONVERSATIONS_TABLE_NAME = "LifeOs-AssistantConversations-test";
  });

  afterEach(() => {
    process.env.ASSISTANT_CONVERSATIONS_TABLE_NAME = originalTable;
  });

  it("reads strongly consistently, so a reply written a moment ago is visible", () => {
    expect(conversationTurnsQuery("user-1", "conv-1").ConsistentRead).toBe(true);
  });

  it("queries the base table by user and conversation prefix, with no index", () => {
    const input = conversationTurnsQuery("user-1", "conv-1");
    expect(input).toEqual({
      TableName: "LifeOs-AssistantConversations-test",
      KeyConditionExpression: "userId = :userId AND begins_with(conversationTurn, :prefix)",
      ExpressionAttributeValues: { ":userId": "user-1", ":prefix": "conv-1#" },
      ConsistentRead: true,
    });
    expect(input).not.toHaveProperty("IndexName");
  });
});
