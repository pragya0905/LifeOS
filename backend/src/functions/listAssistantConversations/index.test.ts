import { beforeEach, describe, expect, it, vi } from "vitest";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";

const send = vi.fn();
vi.mock("../../common/dynamo", () => ({ ddb: { send: (...args: unknown[]) => send(...args) } }));

const { handler } = await import("./index");

function mockEvent(sub: string): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    requestContext: { authorizer: { jwt: { claims: { sub }, scopes: [] } } },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe("listAssistantConversations", () => {
  beforeEach(() => {
    send.mockReset();
    process.env.ASSISTANT_CONVERSATIONS_TABLE_NAME = "LifeOs-AssistantConversations-test";
  });

  it("lists the caller's turns with a strongly consistent query", async () => {
    send.mockResolvedValue({ Items: [] });

    await handler(mockEvent("user-1"), {} as never, () => {});

    const command = send.mock.calls[0][0] as QueryCommand;
    expect(command).toBeInstanceOf(QueryCommand);
    expect(command.input.ConsistentRead).toBe(true);
    expect(command.input.ExpressionAttributeValues).toEqual({ ":userId": "user-1" });
  });
});
