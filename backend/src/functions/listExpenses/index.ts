import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import { EXPENSE_CATEGORIES } from "../../common/expenseCategories";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const from = event.queryStringParameters?.from;
  const to = event.queryStringParameters?.to;
  const category = event.queryStringParameters?.category;

  if (from !== undefined && !DATE_RE.test(from)) return errorResponse(400, "Invalid from date");
  if (to !== undefined && !DATE_RE.test(to)) return errorResponse(400, "Invalid to date");
  if (category !== undefined && !EXPENSE_CATEGORIES.includes(category as never)) {
    return errorResponse(400, `category must be one of ${EXPENSE_CATEGORIES.join(", ")}`);
  }

  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ":userId": userId };
  const filters: string[] = [];

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
  if (category) {
    names["#category"] = "category";
    values[":category"] = category;
    filters.push("#category = :category");
  }

  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.EXPENSES_TABLE_NAME,
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: values,
      ...(filters.length > 0
        ? { FilterExpression: filters.join(" AND "), ExpressionAttributeNames: names }
        : {}),
    }),
  );

  return jsonResponse(200, { expenses: result.Items ?? [] });
};
