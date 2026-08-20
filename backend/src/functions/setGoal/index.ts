import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import type { GoalMetric } from "../../common/types";

const METRICS: GoalMetric[] = ["water", "exercise", "steps"];

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const metric = event.pathParameters?.metric ?? "";
  if (!METRICS.includes(metric as GoalMetric)) {
    return errorResponse(400, `metric must be one of ${METRICS.join(", ")}`);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  if (typeof body.targetValue !== "number" || !Number.isFinite(body.targetValue) || body.targetValue <= 0) {
    return errorResponse(400, "targetValue must be a positive number");
  }

  const now = new Date().toISOString();
  const result = await ddb.send(
    new UpdateCommand({
      TableName: process.env.GOALS_TABLE_NAME,
      Key: { userId, metric },
      UpdateExpression: "SET targetValue = :targetValue, updatedAt = :updatedAt",
      ExpressionAttributeValues: { ":targetValue": body.targetValue, ":updatedAt": now },
      ReturnValues: "ALL_NEW",
    }),
  );

  return jsonResponse(200, result.Attributes);
};
