import { describe, expect, it } from "vitest";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { getUserId, getUsername } from "./auth";

function mockEvent(claims: Record<string, string>): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    requestContext: { authorizer: { jwt: { claims, scopes: [] } } },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe("getUserId", () => {
  it("returns the sub claim", () => {
    expect(getUserId(mockEvent({ sub: "abc-123" }))).toBe("abc-123");
  });

  it("throws rather than silently returning undefined when sub is missing", () => {
    expect(() => getUserId(mockEvent({}))).toThrow();
  });
});

describe("getUsername", () => {
  it("returns the cognito:username claim, distinct from sub", () => {
    expect(getUsername(mockEvent({ sub: "abc-123", "cognito:username": "user@example.com" }))).toBe(
      "user@example.com",
    );
  });

  it("throws rather than silently returning undefined when the username claim is missing", () => {
    expect(() => getUsername(mockEvent({ sub: "abc-123" }))).toThrow();
  });
});
