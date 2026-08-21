import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import { applyJournalExtraction } from "../../common/journal";
import type { JournalEntry } from "../../common/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const date = typeof body.date === "string" ? body.date : "";
  if (!DATE_RE.test(date)) return errorResponse(400, "date is required, format YYYY-MM-DD");

  // Lax by design: Lambda runs in UTC, but the user's local "today" can already be one
  // calendar day ahead of UTC (e.g. IST is UTC+5:30) — a strict UTC comparison would reject
  // a legitimate local-today entry for part of the day. This still catches obviously-wrong
  // far-future dates; the frontend's date picker (bounded by the browser's actual local
  // "today") is the primary guard for the common case.
  const utcTomorrow = new Date();
  utcTomorrow.setUTCDate(utcTomorrow.getUTCDate() + 1);
  if (date > utcTomorrow.toISOString().slice(0, 10)) {
    return errorResponse(400, "date can't be in the future");
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return errorResponse(400, "text is required");

  const now = new Date().toISOString();
  const entry: JournalEntry = {
    userId,
    date,
    text,
    voiceInput: body.voiceInput === true,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await ddb.send(
      new PutCommand({
        TableName: process.env.JOURNAL_TABLE_NAME,
        Item: entry,
        ConditionExpression: "attribute_not_exists(userId)",
      }),
    );
  } catch (err) {
    if (err instanceof Error && err.name === "ConditionalCheckFailedException") {
      return errorResponse(409, "An entry for this date already exists — edit it instead.");
    }
    throw err;
  }

  const extraction = await applyJournalExtraction(userId, date, text);
  if (extraction) entry.aiExtracted = extraction;

  return jsonResponse(201, entry);
};
