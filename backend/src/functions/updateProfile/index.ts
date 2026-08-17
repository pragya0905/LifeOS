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
  if (body.heightCm === undefined) {
    return errorResponse(400, "No updatable fields provided");
  }

  const result = await ddb.send(
    new UpdateCommand({
      TableName: process.env.USER_PROFILE_TABLE_NAME,
      Key: { userId },
      UpdateExpression: "SET heightCm = :heightCm, updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":heightCm": body.heightCm,
        ":updatedAt": new Date().toISOString(),
      },
      ReturnValues: "ALL_NEW",
    }),
  );

  return jsonResponse(200, result.Attributes);
};
