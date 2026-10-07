import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import type { RoutineTemplate } from "../../common/types";

const MAX_CATEGORY_LENGTH = 40;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  // Free text, not a fixed enum — "skinCare"/"hairCare"/"dailyRoutine" are just the presets a
  // picker offers; anything else (e.g. "bodycare") is equally valid.
  const category = typeof body.category === "string" ? body.category.trim() : "";
  if (!category || category.length > MAX_CATEGORY_LENGTH) {
    return errorResponse(400, `category must be a non-empty string up to ${MAX_CATEGORY_LENGTH} characters`);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return errorResponse(400, "name is required");

  const steps = Array.isArray(body.steps)
    ? body.steps.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim())
    : [];
  if (steps.length === 0) return errorResponse(400, "steps must be a non-empty array of strings");

  let daysOfWeek: number[] | undefined;
  if (body.daysOfWeek !== undefined) {
    const rawDays = body.daysOfWeek;
    const valid = Array.isArray(rawDays) && rawDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    if (!valid) return errorResponse(400, "daysOfWeek must be an array of integers 0-6 (0=Sun..6=Sat)");
    if ((rawDays as number[]).length > 0) daysOfWeek = rawDays as number[];
  }

  const routine: RoutineTemplate = {
    userId,
    routineId: randomUUID(),
    category,
    name,
    steps,
    ...(daysOfWeek ? { daysOfWeek } : {}),
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
