import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import { applyJournalExtraction } from "../../common/journal";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const date = event.pathParameters?.date;
  if (!date || !DATE_RE.test(date)) return errorResponse(400, "Invalid date in path");

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return errorResponse(400, "text is required");

  const now = new Date().toISOString();

  let result;
  try {
    result = await ddb.send(
      new UpdateCommand({
        TableName: process.env.JOURNAL_TABLE_NAME,
        Key: { userId, date },
        UpdateExpression: "SET #text = :text, voiceInput = :voiceInput, updatedAt = :updatedAt",
        ExpressionAttributeNames: { "#text": "text" },
        ExpressionAttributeValues: {
          ":text": text,
          ":voiceInput": body.voiceInput === true,
          ":updatedAt": now,
        },
        ConditionExpression: "attribute_exists(userId)",
        ReturnValues: "ALL_NEW",
      }),
    );
  } catch (err) {
    if (err instanceof Error && err.name === "ConditionalCheckFailedException") {
      return errorResponse(404, "No journal entry found for this date");
    }
    throw err;
  }

  const extraction = await applyJournalExtraction(userId, date, text);
  const entry = extraction ? { ...result.Attributes, aiExtracted: extraction } : result.Attributes;

  return jsonResponse(200, entry);
};
