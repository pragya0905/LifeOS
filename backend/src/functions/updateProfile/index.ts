import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  if (
    body.heightCm !== undefined &&
    (typeof body.heightCm !== "number" || !Number.isFinite(body.heightCm) || body.heightCm <= 0)
  ) {
    return errorResponse(400, "heightCm must be a positive number");
  }
  if (
    body.monthlyBudget !== undefined &&
    (typeof body.monthlyBudget !== "number" || !Number.isFinite(body.monthlyBudget) || body.monthlyBudget <= 0)
  ) {
    return errorResponse(400, "monthlyBudget must be a positive number");
  }
  if (body.heightCm === undefined && body.monthlyBudget === undefined) {
    return errorResponse(400, "No updatable fields provided");
  }

  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ":updatedAt": new Date().toISOString() };
  const setClauses = ["updatedAt = :updatedAt"];

  if (body.heightCm !== undefined) {
    names["#heightCm"] = "heightCm";
    values[":heightCm"] = body.heightCm;
    setClauses.push("#heightCm = :heightCm");
  }
  if (body.monthlyBudget !== undefined) {
    names["#monthlyBudget"] = "monthlyBudget";
    values[":monthlyBudget"] = body.monthlyBudget;
    setClauses.push("#monthlyBudget = :monthlyBudget");
  }

  const result = await ddb.send(
    new UpdateCommand({
      TableName: process.env.USER_PROFILE_TABLE_NAME,
      Key: { userId },
      UpdateExpression: `SET ${setClauses.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    }),
  );

  return jsonResponse(200, result.Attributes);
};
