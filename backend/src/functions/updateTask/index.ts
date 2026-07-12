import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import type { TaskPriority, TaskStatus } from "../../common/types";

const VALID_PRIORITIES: TaskPriority[] = ["Low", "Medium", "High"];
const VALID_STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];
const UPDATABLE_FIELDS = ["title", "dueDate", "priority", "status", "scheduleTime"] as const;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const taskId = event.pathParameters?.id;
  if (!taskId) return errorResponse(400, "Missing task id");

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  if (body.priority !== undefined && !VALID_PRIORITIES.includes(body.priority as TaskPriority)) {
    return errorResponse(400, "Invalid priority");
  }
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status as TaskStatus)) {
    return errorResponse(400, "Invalid status");
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

  // A manual priority edit always reasserts human ownership of this field.
  if (updates.includes("priority")) {
    names["#prioritySource"] = "prioritySource";
    values[":prioritySource"] = "manual";
    setParts.push("#prioritySource = :prioritySource");
  }

  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: process.env.TASKS_TABLE_NAME,
        Key: { userId, taskId },
        UpdateExpression: `SET ${setParts.join(", ")}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: "attribute_exists(taskId)",
        ReturnValues: "ALL_NEW",
      }),
    );
    return jsonResponse(200, result.Attributes);
  } catch (err) {
    if (err instanceof Error && err.name === "ConditionalCheckFailedException") {
      return errorResponse(404, "Task not found");
    }
    throw err;
  }
};
