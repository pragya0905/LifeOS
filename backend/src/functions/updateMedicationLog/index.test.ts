import { beforeEach, describe, expect, it, vi } from "vitest";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const send = vi.fn();
vi.mock("../../common/dynamo", () => ({ ddb: { send: (...args: unknown[]) => send(...args) } }));

const { handler } = await import("./index");

function mockEvent(): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    pathParameters: { date: "2026-10-23", medicationId: "m1" },
    body: JSON.stringify({ status: "taken" }),
    requestContext: { authorizer: { jwt: { claims: { sub: "user-1" }, scopes: [] } } },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe("updateMedicationLog", () => {
  beforeEach(() => {
    send.mockReset();
    process.env.MEDICATIONS_TABLE_NAME = "medications";
    process.env.MEDICATION_LOGS_TABLE_NAME = "medication-logs";
  });

  it("returns the logged attributes plus the medication's own name", async () => {
    send.mockImplementation(async (cmd: unknown) => {
      if (cmd instanceof GetCommand) return { Item: { medicationId: "m1", name: "Vitamin D" } };
      if (cmd instanceof UpdateCommand) return { Attributes: { dateMedicationId: "2026-10-23#m1", status: "taken" } };
      throw new Error("unexpected command");
    });

    const res = (await handler(mockEvent(), {} as never, () => {})) as { statusCode: number; body: string };

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      dateMedicationId: "2026-10-23#m1",
      status: "taken",
      medicationName: "Vitamin D",
    });
  });
});
