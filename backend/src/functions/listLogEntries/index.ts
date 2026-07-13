import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import { LOG_TYPES } from "../../common/logEntrySchemas";
import type { LogType } from "../../common/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const logType = event.queryStringParameters?.logType;
  const from = event.queryStringParameters?.from;
  const to = event.queryStringParameters?.to;

  if (logType !== undefined && !LOG_TYPES.includes(logType as LogType)) {
    return errorResponse(400, `logType must be one of ${LOG_TYPES.join(", ")}`);
  }
  if (from !== undefined && !DATE_RE.test(from)) return errorResponse(400, "Invalid from date");
  if (to !== undefined && !DATE_RE.test(to)) return errorResponse(400, "Invalid to date");

  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ":userId": userId };
  const filters: string[] = [];

  if (logType) {
    names["#logType"] = "logType";
    values[":logType"] = logType;
    filters.push("#logType = :logType");
  }
  if (from && to) {
    names["#date"] = "date";
    values[":from"] = from;
    values[":to"] = to;
    filters.push("#date BETWEEN :from AND :to");
  } else if (from) {
    names["#date"] = "date";
    values[":from"] = from;
    filters.push("#date >= :from");
  } else if (to) {
    names["#date"] = "date";
    values[":to"] = to;
    filters.push("#date <= :to");
  }

  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.LOG_ENTRIES_TABLE_NAME,
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: values,
      ...(filters.length > 0
        ? { FilterExpression: filters.join(" AND "), ExpressionAttributeNames: names }
        : {}),
    }),
  );

  return jsonResponse(200, { entries: result.Items ?? [] });
};
