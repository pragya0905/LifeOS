import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import type { RoutineCategory, RoutineTemplate } from "../../common/types";

const CATEGORIES: RoutineCategory[] = ["skinCare", "hairCare", "dailyRoutine", "custom"];

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const category = body.category as RoutineCategory;
  if (!CATEGORIES.includes(category)) {
    return errorResponse(400, `category must be one of ${CATEGORIES.join(", ")}`);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return errorResponse(400, "name is required");

  const steps = Array.isArray(body.steps)
    ? body.steps.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim())
    : [];
  if (steps.length === 0) return errorResponse(400, "steps must be a non-empty array of strings");

  const routine: RoutineTemplate = {
    userId,
    routineId: randomUUID(),
    category,
    name,
    steps,
    createdAt: new Date().toISOString(),
  };

  await ddb.send(
    new PutCommand({
      TableName: process.env.ROUTINE_TEMPLATES_TABLE_NAME,
      Item: routine,
    }),
  );

  return jsonResponse(201, routine);
};
