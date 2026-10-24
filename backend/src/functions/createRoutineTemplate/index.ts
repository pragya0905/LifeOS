import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import type { RoutineTemplate } from "../../common/types";
import { checkEndTime, checkReminderLead, checkStepMinutes, checkTimezoneOffset } from "../../common/timelineFields";
import { isValidTimeOfDay } from "../../common/timeOfDay";

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

  if (body.timeOfDay !== undefined && !isValidTimeOfDay(body.timeOfDay)) {
    return errorResponse(400, "timeOfDay must be in HH:MM format");
  }

  if (
    body.estimatedMinutes !== undefined &&
    (typeof body.estimatedMinutes !== "number" || !Number.isFinite(body.estimatedMinutes) || body.estimatedMinutes <= 0)
  ) {
    return errorResponse(400, "estimatedMinutes must be a positive number");
  }

  if (body.endTime !== undefined) {
    const err = checkEndTime(body.endTime);
    if (err) return errorResponse(400, err);
  }
  if (body.stepMinutes !== undefined) {
    const err = checkStepMinutes(body.stepMinutes, steps.length);
    if (err) return errorResponse(400, err);
  }
  if (body.reminderLeadMinutes !== undefined) {
    const err = checkReminderLead(body.reminderLeadMinutes);
    if (err) return errorResponse(400, err);
  }
  if (body.timezoneOffsetMinutes !== undefined) {
    const err = checkTimezoneOffset(body.timezoneOffsetMinutes);
    if (err) return errorResponse(400, err);
  }

  const routine: RoutineTemplate = {
    userId,
    routineId: randomUUID(),
    category,
    name,
    steps,
    ...(daysOfWeek ? { daysOfWeek } : {}),
    ...(typeof body.timeOfDay === "string" ? { timeOfDay: body.timeOfDay } : {}),
    ...(typeof body.estimatedMinutes === "number" ? { estimatedMinutes: body.estimatedMinutes } : {}),
    ...(typeof body.endTime === "string" ? { endTime: body.endTime } : {}),
    ...(Array.isArray(body.stepMinutes) ? { stepMinutes: body.stepMinutes as number[] } : {}),
    ...(body.remindMe === true ? { remindMe: true } : {}),
    ...(typeof body.reminderLeadMinutes === "number" ? { reminderLeadMinutes: body.reminderLeadMinutes } : {}),
    ...(typeof body.timezoneOffsetMinutes === "number" ? { timezoneOffsetMinutes: body.timezoneOffsetMinutes } : {}),
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
