import { beforeEach, describe, expect, it, vi } from "vitest";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";

const send = vi.fn();
vi.mock("../../common/dynamo", () => ({ ddb: { send: (...args: unknown[]) => send(...args) } }));

const { handler } = await import("./index");

function mockEvent(sub: string, conversationId?: string): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    pathParameters: conversationId ? { id: conversationId } : undefined,
    requestContext: { authorizer: { jwt: { claims: { sub }, scopes: [] } } },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe("getAssistantConversation", () => {
  beforeEach(() => {
    send.mockReset();
    process.env.ASSISTANT_CONVERSATIONS_TABLE_NAME = "LifeOs-AssistantConversations-test";
  });

  it("issues a strongly consistent query for the caller's conversation", async () => {
    send.mockResolvedValue({ Items: [{ conversationTurn: "conv-1#000000000000001" }] });

    const res = await handler(mockEvent("user-1", "conv-1"), {} as never, () => {});

    const command = send.mock.calls[0][0] as QueryCommand;
    expect(command).toBeInstanceOf(QueryCommand);
    expect(command.input.ConsistentRead).toBe(true);
    expect(command.input.ExpressionAttributeValues).toEqual({ ":userId": "user-1", ":prefix": "conv-1#" });
    expect(res).toMatchObject({ statusCode: 200 });
  });

  it("returns an empty turns list rather than failing when nothing is stored", async () => {
    send.mockResolvedValue({ Items: undefined });

    const res = (await handler(mockEvent("user-1", "conv-1"), {} as never, () => {})) as { body: string };

    expect(JSON.parse(res.body)).toEqual({ turns: [] });
  });
});
