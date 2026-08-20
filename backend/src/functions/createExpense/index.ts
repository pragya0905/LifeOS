import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import { EXPENSE_CATEGORIES } from "../../common/expenseCategories";
import type { Expense } from "../../common/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  if (!EXPENSE_CATEGORIES.includes(body.category as never)) {
    return errorResponse(400, `category must be one of ${EXPENSE_CATEGORIES.join(", ")}`);
  }
  if (typeof body.amount !== "number" || body.amount < 0) {
    return errorResponse(400, "amount must be a non-negative number");
  }
  const date = typeof body.date === "string" ? body.date : "";
  if (!DATE_RE.test(date)) return errorResponse(400, "date must be in YYYY-MM-DD format");

  const now = new Date().toISOString();
  const expense: Expense = {
    userId,
    expenseId: randomUUID(),
    category: body.category as Expense["category"],
    amount: body.amount,
    note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : undefined,
    date,
    source: "manual",
    createdAt: now,
    updatedAt: now,
  };

  await ddb.send(new PutCommand({ TableName: process.env.EXPENSES_TABLE_NAME, Item: expense }));

  return jsonResponse(201, expense);
};
