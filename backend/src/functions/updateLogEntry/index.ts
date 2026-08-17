import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import { LOG_ENTRY_SCHEMAS } from "../../common/logEntrySchemas";
import type { LogEntry, LogType } from "../../common/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const logId = event.pathParameters?.id;
  if (!logId) return errorResponse(400, "Missing log id");

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  if (body.date === undefined && body.data === undefined) {
    return errorResponse(400, "No updatable fields provided");
  }
  if (body.date !== undefined && (typeof body.date !== "string" || !DATE_RE.test(body.date))) {
    return errorResponse(400, "date must be YYYY-MM-DD");
  }

  const existing = await ddb.send(
    new GetCommand({
      TableName: process.env.LOG_ENTRIES_TABLE_NAME,
      Key: { userId, logId },
    }),
  );
  const current = existing.Item as LogEntry | undefined;
  if (!current) return errorResponse(404, "Log entry not found");

  let data = current.data;
  if (body.data !== undefined) {
    const parsed = LOG_ENTRY_SCHEMAS[current.logType as LogType].safeParse(body.data);
    if (!parsed.success) {
      return errorResponse(400, `Invalid data for logType ${current.logType}: ${parsed.error.message}`);
    }
    data = parsed.data as Record<string, unknown>;
  }

  const now = new Date().toISOString();
  const result = await ddb.send(
    new UpdateCommand({
      TableName: process.env.LOG_ENTRIES_TABLE_NAME,
      Key: { userId, logId },
      UpdateExpression:
        "SET #date = :date, #data = :data, #source = :source, updatedAt = :updatedAt",
      ExpressionAttributeNames: { "#date": "date", "#data": "data", "#source": "source" },
      ExpressionAttributeValues: {
        ":date": typeof body.date === "string" ? body.date : current.date,
        ":data": data,
        ":source": "manual",
        ":updatedAt": now,
      },
      ConditionExpression: "attribute_exists(userId)",
      ReturnValues: "ALL_NEW",
    }),
  );

  return jsonResponse(200, result.Attributes);
};
