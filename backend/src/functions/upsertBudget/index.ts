import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import { EXPENSE_CATEGORIES } from "../../common/expenseCategories";
import type { Budget } from "../../common/types";

// PUT /budgets/{category} — one recurring row per category, so setting a budget for a
// category that already has one just overwrites the limit rather than needing a
// separate create-vs-update distinction (there's no per-month record to manage).
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const category = event.pathParameters?.category;
  if (!category || !EXPENSE_CATEGORIES.includes(category as never)) {
    return errorResponse(400, `category must be one of ${EXPENSE_CATEGORIES.join(", ")}`);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  if (typeof body.monthlyLimit !== "number" || body.monthlyLimit <= 0) {
    return errorResponse(400, "monthlyLimit must be a positive number");
  }

  const existing = await ddb.send(
    new GetCommand({ TableName: process.env.BUDGETS_TABLE_NAME, Key: { userId, category } }),
  );
  const now = new Date().toISOString();
  const budget: Budget = {
    userId,
    category: category as Budget["category"],
    monthlyLimit: body.monthlyLimit,
    createdAt: (existing.Item as Budget | undefined)?.createdAt ?? now,
    updatedAt: now,
  };

  await ddb.send(new PutCommand({ TableName: process.env.BUDGETS_TABLE_NAME, Item: budget }));

  return jsonResponse(200, budget);
};
