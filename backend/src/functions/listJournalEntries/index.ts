import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import type { JournalEntry } from "../../common/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const from = event.queryStringParameters?.from;
  const to = event.queryStringParameters?.to;

  if (from !== undefined && !DATE_RE.test(from)) return errorResponse(400, "Invalid from date");
  if (to !== undefined && !DATE_RE.test(to)) return errorResponse(400, "Invalid to date");

  const values: Record<string, unknown> = { ":userId": userId };
  let keyCondition = "userId = :userId";
  let usesDate = true;

  if (from && to) {
    values[":from"] = from;
    values[":to"] = to;
    keyCondition += " AND #date BETWEEN :from AND :to";
  } else if (from) {
    values[":from"] = from;
    keyCondition += " AND #date >= :from";
  } else if (to) {
    values[":to"] = to;
    keyCondition += " AND #date <= :to";
  } else {
    usesDate = false;
  }

  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.JOURNAL_TABLE_NAME,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: values,
      ...(usesDate ? { ExpressionAttributeNames: { "#date": "date" } } : {}),
      ScanIndexForward: false,
    }),
  );

  // embedding is an internal field powering /journal/search — strip it before sending the
  // list to the frontend, which never uses it and would otherwise pay for it on every load.
  const entries = ((result.Items ?? []) as JournalEntry[]).map(({ embedding: _embedding, ...rest }) => rest);

  return jsonResponse(200, { entries });
};
