import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import { sendPushNotification } from "../../common/pushNotifications";
import { WISH_TYPES, WISH_PROGRESS_MODES, WISH_STATUSES, isValidMilestones } from "../../common/wishes";
import type { PushSubscription, Wish } from "../../common/types";

const UPDATABLE_FIELDS = [
  "title",
  "type",
  "progressMode",
  "status",
  "targetDate",
  "percentage",
  "milestones",
  "quantityTarget",
  "quantityCurrent",
  "quantityUnit",
  "linkedHabitType",
  "habitLinkTargetValue",
  "imageKeys",
] as const;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const wishId = event.pathParameters?.id;
  if (!wishId) return errorResponse(400, "Missing wish id");

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  if (body.type !== undefined && !WISH_TYPES.includes(body.type as never)) {
    return errorResponse(400, `type must be one of ${WISH_TYPES.join(", ")}`);
  }
  if (body.progressMode !== undefined && !WISH_PROGRESS_MODES.includes(body.progressMode as never)) {
    return errorResponse(400, `progressMode must be one of ${WISH_PROGRESS_MODES.join(", ")}`);
  }
  if (body.status !== undefined && !WISH_STATUSES.includes(body.status as never)) {
    return errorResponse(400, `status must be one of ${WISH_STATUSES.join(", ")}`);
  }
  if (body.milestones !== undefined && !isValidMilestones(body.milestones)) {
    return errorResponse(400, "milestones must be an array of {id, text, done, targetDate?}");
  }
  if (body.percentage !== undefined) {
    if (typeof body.percentage !== "number" || body.percentage < 0 || body.percentage > 100) {
      return errorResponse(400, "percentage must be between 0 and 100");
    }
  }

  const updates = UPDATABLE_FIELDS.filter((field) => body[field] !== undefined);
  if (updates.length === 0) return errorResponse(400, "No updatable fields provided");

  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ":updatedAt": new Date().toISOString() };
  const setParts = ["updatedAt = :updatedAt"];
  for (const field of updates) {
    names[`#${field}`] = field;
    values[`:${field}`] = body[field];
    setParts.push(`#${field} = :${field}`);
  }

  // A milestone update that completes every milestone auto-completes the wish and
  // fires a celebration push — this is the one reminder-adjacent thing that happens
  // immediately rather than waiting for the scheduler's next 15-minute pass.
  let celebrate = false;
  if (updates.includes("milestones")) {
    const milestones = body.milestones as Wish["milestones"];
    if (milestones && milestones.length > 0 && milestones.every((m) => m.done)) {
      celebrate = true;
      if (body.status === undefined) {
        names["#status"] = "status";
        values[":status"] = "completed";
        setParts.push("#status = :status");
      }
    }
  }

  let wish: Wish;
  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: process.env.WISHES_TABLE_NAME,
        Key: { userId, wishId },
        UpdateExpression: `SET ${setParts.join(", ")}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: "attribute_exists(wishId)",
        ReturnValues: "ALL_NEW",
      }),
    );
    wish = result.Attributes as Wish;
  } catch (err) {
    if (err instanceof Error && err.name === "ConditionalCheckFailedException") {
      return errorResponse(404, "Wish not found");
    }
    throw err;
  }

  if (celebrate) {
    try {
      const subsResult = await ddb.send(
        new QueryCommand({
          TableName: process.env.PUSH_SUBSCRIPTIONS_TABLE_NAME,
          KeyConditionExpression: "userId = :userId",
          ExpressionAttributeValues: { ":userId": userId },
        }),
      );
      const subs = (subsResult.Items ?? []) as PushSubscription[];
      await Promise.all(
        subs.map((sub) =>
          sendPushNotification(sub, {
            title: "Wish completed!",
            body: `You finished every milestone for "${wish.title}".`,
          }).catch((err) => console.error("Failed to send celebration push:", err)),
        ),
      );
    } catch (err) {
      console.error("Failed to send milestone celebration push:", err);
    }
  }

  return jsonResponse(200, wish);
};
