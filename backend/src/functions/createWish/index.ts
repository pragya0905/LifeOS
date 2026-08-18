import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import { WISH_TYPES, WISH_PROGRESS_MODES, WISH_HABIT_TYPES } from "../../common/wishes";
import type { Wish, WishProgressMode } from "../../common/types";

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return errorResponse(400, "title is required");

  if (!WISH_TYPES.includes(body.type as never)) {
    return errorResponse(400, `type must be one of ${WISH_TYPES.join(", ")}`);
  }
  if (!WISH_PROGRESS_MODES.includes(body.progressMode as never)) {
    return errorResponse(400, `progressMode must be one of ${WISH_PROGRESS_MODES.join(", ")}`);
  }
  const progressMode = body.progressMode as WishProgressMode;

  if (progressMode === "habit_linked") {
    if (!WISH_HABIT_TYPES.includes(body.linkedHabitType as never)) {
      return errorResponse(400, `linkedHabitType must be one of ${WISH_HABIT_TYPES.join(", ")}`);
    }
    if (typeof body.habitLinkTargetValue !== "number" || body.habitLinkTargetValue <= 0) {
      return errorResponse(400, "habitLinkTargetValue must be a positive number");
    }
  }
  if (progressMode === "quantity") {
    if (typeof body.quantityTarget !== "number" || body.quantityTarget <= 0) {
      return errorResponse(400, "quantityTarget must be a positive number");
    }
  }
  if (progressMode === "time_based" && typeof body.targetDate !== "string") {
    return errorResponse(400, "targetDate is required for time_based progress");
  }

  const now = new Date().toISOString();
  const wish: Wish = {
    userId,
    wishId: randomUUID(),
    title,
    type: body.type as Wish["type"],
    progressMode,
    status: "active",
    targetDate: typeof body.targetDate === "string" ? body.targetDate : undefined,
    percentage: progressMode === "percentage" ? 0 : undefined,
    milestones: progressMode === "milestone" ? [] : undefined,
    quantityTarget: typeof body.quantityTarget === "number" ? body.quantityTarget : undefined,
    quantityCurrent: progressMode === "quantity" ? 0 : undefined,
    quantityUnit: typeof body.quantityUnit === "string" ? body.quantityUnit : undefined,
    linkedHabitType: typeof body.linkedHabitType === "string" ? (body.linkedHabitType as Wish["linkedHabitType"]) : undefined,
    habitLinkTargetValue:
      typeof body.habitLinkTargetValue === "number" ? body.habitLinkTargetValue : undefined,
    imageKeys: [],
    createdAt: now,
    updatedAt: now,
  };

  await ddb.send(new PutCommand({ TableName: process.env.WISHES_TABLE_NAME, Item: wish }));

  return jsonResponse(201, wish);
};
