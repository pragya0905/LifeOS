import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import { EXPENSE_CATEGORIES } from "../../common/expenseCategories";

const UPDATABLE_FIELDS = ["category", "amount", "note", "date"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const expenseId = event.pathParameters?.id;
  if (!expenseId) return errorResponse(400, "Missing expense id");

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  if (body.category !== undefined && !EXPENSE_CATEGORIES.includes(body.category as never)) {
    return errorResponse(400, `category must be one of ${EXPENSE_CATEGORIES.join(", ")}`);
  }
  if (body.amount !== undefined && (typeof body.amount !== "number" || body.amount < 0)) {
    return errorResponse(400, "amount must be a non-negative number");
  }
  if (body.date !== undefined && (typeof body.date !== "string" || !DATE_RE.test(body.date))) {
    return errorResponse(400, "date must be in YYYY-MM-DD format");
  }

  const updates = UPDATABLE_FIELDS.filter((field) => body[field] !== undefined);
  if (updates.length === 0) return errorResponse(400, "No updatable fields provided");

  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ":updatedAt": new Date().toISOString() };
  const setClauses = ["updatedAt = :updatedAt"];

  for (const field of updates) {
    names[`#${field}`] = field;
    values[`:${field}`] = body[field];
    setClauses.push(`#${field} = :${field}`);
  }

  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: process.env.EXPENSES_TABLE_NAME,
        Key: { userId, expenseId },
        UpdateExpression: `SET ${setClauses.join(", ")}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: "attribute_exists(expenseId)",
        ReturnValues: "ALL_NEW",
      }),
    );
    return jsonResponse(200, result.Attributes);
  } catch (err) {
    if (err instanceof Error && err.name === "ConditionalCheckFailedException") {
      return errorResponse(404, "Expense not found");
    }
    throw err;
  }
};
