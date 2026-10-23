import { beforeEach, describe, expect, it, vi } from "vitest";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const send = vi.fn();
vi.mock("../../common/dynamo", () => ({ ddb: { send: (...args: unknown[]) => send(...args) } }));

const { handler } = await import("./index");

function mockEvent(): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    pathParameters: { date: "2026-10-23", routineId: "r1", stepIndex: "1" },
    body: JSON.stringify({ status: "done" }),
    requestContext: { authorizer: { jwt: { claims: { sub: "user-1" }, scopes: [] } } },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe("updateRoutineStepLog", () => {
  beforeEach(() => {
    send.mockReset();
    process.env.ROUTINE_TEMPLATES_TABLE_NAME = "routines";
    process.env.ROUTINE_LOGS_TABLE_NAME = "routine-logs";
  });

  it("returns the logged attributes plus the step's own text", async () => {
    send.mockImplementation(async (cmd: unknown) => {
      if (cmd instanceof GetCommand) return { Item: { routineId: "r1", steps: ["Cleanser", "Toner", "Moisturiser"] } };
      if (cmd instanceof UpdateCommand) return { Attributes: { dateRoutineStep: "2026-10-23#r1#1", status: "done" } };
      throw new Error("unexpected command");
    });

    const res = (await handler(mockEvent(), {} as never, () => {})) as { statusCode: number; body: string };

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      dateRoutineStep: "2026-10-23#r1#1",
      status: "done",
      stepName: "Toner",
    });
  });
});
