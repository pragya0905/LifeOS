import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import type { PushSubscription } from "../../common/types";

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const keys = body.keys as { p256dh?: unknown; auth?: unknown } | undefined;
  if (!endpoint || typeof keys?.p256dh !== "string" || typeof keys?.auth !== "string") {
    return errorResponse(400, "endpoint and keys.p256dh/keys.auth are required");
  }

  const subscription: PushSubscription = {
    userId,
    endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    createdAt: new Date().toISOString(),
  };

  await ddb.send(
    new PutCommand({ TableName: process.env.PUSH_SUBSCRIPTIONS_TABLE_NAME, Item: subscription }),
  );

  return jsonResponse(201, subscription);
};
