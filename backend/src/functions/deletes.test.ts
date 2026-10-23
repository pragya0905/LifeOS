import { beforeEach, describe, expect, it, vi } from "vitest";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

// One table-driven test for the seven delete handlers that report whether they removed anything.
// Each handler must: send ReturnValues ALL_OLD, key the item by the caller's JWT sub (so another
// user's id is never touched), and answer deleted:false when nothing was there.

const send = vi.fn();
vi.mock("../common/dynamo", () => ({ ddb: { send: (...args: unknown[]) => send(...args) } }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = vi.fn();
  },
  DeleteObjectsCommand: class {},
}));

function event(pathParameters: Record<string, string>, sub = "user-1"): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    pathParameters,
    requestContext: { authorizer: { jwt: { claims: { sub }, scopes: [] } } },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

const cases = [
  { name: "deleteTask", path: "../functions/deleteTask/index", params: { id: "t1" }, table: "TASKS_TABLE_NAME", key: { taskId: "t1" } },
  { name: "deleteExpense", path: "./deleteExpense/index", params: { id: "e1" }, table: "EXPENSES_TABLE_NAME", key: { expenseId: "e1" } },
  { name: "deleteBudget", path: "./deleteBudget/index", params: { category: "food" }, table: "BUDGETS_TABLE_NAME", key: { category: "food" } },
  { name: "deleteMemory", path: "./deleteMemory/index", params: { id: "m1" }, table: "USER_MEMORY_TABLE_NAME", key: { memoryId: "m1" } },
  { name: "deleteMealPlanSlot", path: "./deleteMealPlanSlot/index", params: { date: "2026-10-23", mealType: "lunch" }, table: "MEAL_PLAN_TABLE_NAME", key: { dateMealType: "2026-10-23#lunch" } },
  { name: "deleteMealPlanTemplate", path: "./deleteMealPlanTemplate/index", params: { day: "1", mealType: "dinner" }, table: "MEAL_PLAN_TEMPLATES_TABLE_NAME", key: { dayMealType: "1#dinner" } },
] as const;

describe.each(cases)("$name", ({ path, params, table, key }) => {
  beforeEach(() => {
    send.mockReset();
    process.env[table] = "test-table";
  });

  it("reports deleted:true and asks for the removed item when one existed", async () => {
    const { handler } = await import(path);
    send.mockResolvedValue({ Attributes: { userId: "user-1", ...key } });

    const res = (await handler(event(params), {} as never, () => {})) as { statusCode: number; body: string };

    const command = send.mock.calls[0][0] as DeleteCommand;
    expect(command).toBeInstanceOf(DeleteCommand);
    expect(command.input.ReturnValues).toBe("ALL_OLD");
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ deleted: true });
  });

  it("reports deleted:false, not an error, when the id does not exist", async () => {
    const { handler } = await import(path);
    send.mockResolvedValue({});

    const res = (await handler(event(params), {} as never, () => {})) as { statusCode: number; body: string };

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ deleted: false });
  });

  it("keys the delete by the caller's own id, so another user's item is never the target", async () => {
    const { handler } = await import(path);
    send.mockResolvedValue({});

    await handler(event(params, "user-2"), {} as never, () => {});

    const command = send.mock.calls[0][0] as DeleteCommand;
    expect(command.input.Key).toMatchObject({ userId: "user-2", ...key });
  });
});

describe("deleteWish", () => {
  beforeEach(() => {
    send.mockReset();
    process.env.WISHES_TABLE_NAME = "test-wishes";
  });

  it("reports deleted:false and sends no delete when the wish does not exist", async () => {
    const { handler } = await import("./deleteWish/index");
    send.mockImplementation(async (cmd: unknown) => {
      if (cmd instanceof GetCommand) return {};
      throw new Error("no delete should be sent");
    });

    const res = (await handler(event({ id: "w1" }), {} as never, () => {})) as { body: string };

    expect(JSON.parse(res.body)).toEqual({ deleted: false });
    expect(send.mock.calls.some(([cmd]) => cmd instanceof DeleteCommand)).toBe(false);
  });

  it("deletes an existing wish by the caller's own id and reports deleted:true", async () => {
    const { handler } = await import("./deleteWish/index");
    send.mockImplementation(async (cmd: unknown) => {
      if (cmd instanceof GetCommand) return { Item: { userId: "user-1", wishId: "w1", title: "Trip" } };
      if (cmd instanceof DeleteCommand) return { Attributes: { userId: "user-1", wishId: "w1" } };
      throw new Error("unexpected");
    });

    const res = (await handler(event({ id: "w1" }), {} as never, () => {})) as { body: string };

    expect(JSON.parse(res.body)).toEqual({ deleted: true });
    const del = send.mock.calls.find(([cmd]) => cmd instanceof DeleteCommand)![0] as DeleteCommand;
    expect(del.input.Key).toEqual({ userId: "user-1", wishId: "w1" });
    expect(del.input.ReturnValues).toBe("ALL_OLD");
  });
});
