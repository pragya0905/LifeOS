import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import { LOG_ENTRY_SCHEMAS, LOG_TYPES, SINGULAR_LOG_TYPES } from "../../common/logEntrySchemas";
import type { LogEntry, LogType } from "../../common/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const logType = body.logType as LogType;
  if (!LOG_TYPES.includes(logType)) {
    return errorResponse(400, `logType must be one of ${LOG_TYPES.join(", ")}`);
  }

  const date = typeof body.date === "string" ? body.date : "";
  if (!DATE_RE.test(date)) return errorResponse(400, "date is required, format YYYY-MM-DD");

  const parsed = LOG_ENTRY_SCHEMAS[logType].safeParse(body.data);
  if (!parsed.success) {
    return errorResponse(400, `Invalid data for logType ${logType}: ${parsed.error.message}`);
  }

  const now = new Date().toISOString();
  const logId = SINGULAR_LOG_TYPES.includes(logType) ? `${date}-${logType}` : randomUUID();
  const entry: LogEntry = {
    userId,
    logId,
    logType,
    date,
    data: parsed.data as Record<string, unknown>,
    source: "manual",
    createdAt: now,
    updatedAt: now,
  };

  await ddb.send(
    new PutCommand({
      TableName: process.env.LOG_ENTRIES_TABLE_NAME,
      Item: entry,
    }),
  );

  return jsonResponse(201, entry);
};
