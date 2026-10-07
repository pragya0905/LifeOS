import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";

const MAX_CATEGORY_LENGTH = 40;
const UPDATABLE_FIELDS = ["name", "category", "steps", "daysOfWeek"] as const;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const routineId = event.pathParameters?.id;
  if (!routineId) return errorResponse(400, "Missing routine id");

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  if (body.category !== undefined) {
    if (typeof body.category !== "string" || !body.category.trim() || body.category.length > MAX_CATEGORY_LENGTH) {
      return errorResponse(400, `category must be a non-empty string up to ${MAX_CATEGORY_LENGTH} characters`);
    }
    body.category = body.category.trim();
  }
  if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) {
    return errorResponse(400, "name must be a non-empty string");
  }
  if (body.steps !== undefined) {
    const valid =
      Array.isArray(body.steps) &&
      body.steps.length > 0 &&
      body.steps.every((s) => typeof s === "string" && s.trim().length > 0);
    if (!valid) return errorResponse(400, "steps must be a non-empty array of non-empty strings");
    body.steps = (body.steps as string[]).map((s) => s.trim());
  }
  if (typeof body.name === "string") body.name = body.name.trim();

  if (body.daysOfWeek !== undefined) {
    const valid =
      Array.isArray(body.daysOfWeek) &&
      body.daysOfWeek.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    if (!valid) return errorResponse(400, "daysOfWeek must be an array of integers 0-6 (0=Sun..6=Sat)");
  }

  const updates = UPDATABLE_FIELDS.filter((field) => body[field] !== undefined);
  if (updates.length === 0) return errorResponse(400, "No updatable fields provided");

  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const setClauses: string[] = [];
  for (const field of updates) {
    names[`#${field}`] = field;
    values[`:${field}`] = body[field];
    setClauses.push(`#${field} = :${field}`);
  }

  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: process.env.ROUTINE_TEMPLATES_TABLE_NAME,
        Key: { userId, routineId },
        UpdateExpression: `SET ${setClauses.join(", ")}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: "attribute_exists(routineId)",
        ReturnValues: "ALL_NEW",
      }),
    );
    return jsonResponse(200, result.Attributes);
  } catch (err) {
    if (err instanceof Error && err.name === "ConditionalCheckFailedException") {
      return errorResponse(404, "Routine not found");
    }
    throw err;
  }
};
