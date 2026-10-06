import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const UPDATABLE_FIELDS = [
  "name",
  "dosage",
  "notes",
  "startDate",
  "durationDays",
  "timeOfDay",
  "timezoneOffsetMinutes",
] as const;

// Same UPDATABLE_FIELDS/UpdateCommand pattern as updateRoutineTemplate and updateExpense.
// There was previously no edit path for a medication at all (only create/delete/log) — this
// fills that gap, including the reminder schedule (timeOfDay/timezoneOffsetMinutes), which
// createMedication already supports setting but had no way to change afterward.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const medicationId = event.pathParameters?.id;
  if (!medicationId) return errorResponse(400, "Missing medication id");

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) {
    return errorResponse(400, "name must be a non-empty string");
  }
  if (typeof body.name === "string") body.name = body.name.trim();
  if (body.dosage !== undefined && typeof body.dosage === "string") body.dosage = body.dosage.trim();
  if (body.notes !== undefined && typeof body.notes === "string") body.notes = body.notes.trim();
  if (body.startDate !== undefined && (typeof body.startDate !== "string" || !DATE_RE.test(body.startDate))) {
    return errorResponse(400, "startDate must be YYYY-MM-DD");
  }
  if (
    body.durationDays !== undefined &&
    (typeof body.durationDays !== "number" || !Number.isInteger(body.durationDays) || body.durationDays < 1)
  ) {
    return errorResponse(400, "durationDays must be a positive integer");
  }
  if (body.timeOfDay !== undefined && (typeof body.timeOfDay !== "string" || !TIME_RE.test(body.timeOfDay))) {
    return errorResponse(400, "timeOfDay must be in HH:MM format");
  }
  if (
    body.timeOfDay !== undefined &&
    (body.timezoneOffsetMinutes === undefined || typeof body.timezoneOffsetMinutes !== "number")
  ) {
    return errorResponse(400, "timezoneOffsetMinutes is required alongside timeOfDay");
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

  // Changing timeOfDay mid-day must not get silently swallowed by the reminder scheduler's
  // "already sent today" guard (lastReminderSentDate === today) — that guard is keyed only on
  // the date, not the time, so without this reset, moving today's reminder from 9am to 6pm
  // after the 9am one already fired would skip the new 6pm time entirely until tomorrow.
  let updateExpression = `SET ${setClauses.join(", ")}`;
  if (body.timeOfDay !== undefined) {
    names["#lastReminderSentDate"] = "lastReminderSentDate";
    updateExpression += " REMOVE #lastReminderSentDate";
  }

  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: process.env.MEDICATIONS_TABLE_NAME,
        Key: { userId, medicationId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: "attribute_exists(medicationId)",
        ReturnValues: "ALL_NEW",
      }),
    );
    return jsonResponse(200, result.Attributes);
  } catch (err) {
    if (err instanceof Error && err.name === "ConditionalCheckFailedException") {
      return errorResponse(404, "Medication not found");
    }
    throw err;
  }
};
