import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const from = event.queryStringParameters?.from;
  const to = event.queryStringParameters?.to;

  if (from !== undefined && !DATE_RE.test(from)) return errorResponse(400, "Invalid from date");
  if (to !== undefined && !DATE_RE.test(to)) return errorResponse(400, "Invalid to date");

  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ":userId": userId };
  let filterExpression: string | undefined;

  if (from && to) {
    names["#date"] = "date";
    values[":from"] = from;
    values[":to"] = to;
    filterExpression = "#date BETWEEN :from AND :to";
  } else if (from) {
    names["#date"] = "date";
    values[":from"] = from;
    filterExpression = "#date >= :from";
  } else if (to) {
    names["#date"] = "date";
    values[":to"] = to;
    filterExpression = "#date <= :to";
  }

  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.JOURNAL_TABLE_NAME,
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: values,
      ...(filterExpression
        ? { FilterExpression: filterExpression, ExpressionAttributeNames: names }
        : {}),
    }),
  );

  return jsonResponse(200, { entries: result.Items ?? [] });
};
