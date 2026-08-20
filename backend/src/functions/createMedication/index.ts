import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import { computeEndDate } from "../../common/medications";
import type { Medication } from "../../common/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return errorResponse(400, "name is required");

  const startDate = typeof body.startDate === "string" ? body.startDate : today();
  if (!DATE_RE.test(startDate)) return errorResponse(400, "startDate must be YYYY-MM-DD");

  const durationDays = body.durationDays;
  if (typeof durationDays !== "number" || !Number.isInteger(durationDays) || durationDays < 1) {
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

  const medication: Medication = {
    userId,
    medicationId: randomUUID(),
    name,
    dosage: typeof body.dosage === "string" && body.dosage.trim() ? body.dosage.trim() : undefined,
    notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : undefined,
    timeOfDay: typeof body.timeOfDay === "string" ? body.timeOfDay : undefined,
    timezoneOffsetMinutes:
      typeof body.timezoneOffsetMinutes === "number" ? body.timezoneOffsetMinutes : undefined,
    startDate,
    durationDays,
    createdAt: new Date().toISOString(),
  };

  await ddb.send(
    new PutCommand({
      TableName: process.env.MEDICATIONS_TABLE_NAME,
      Item: medication,
    }),
  );

  return jsonResponse(201, { ...medication, endDate: computeEndDate(startDate, durationDays) });
};
