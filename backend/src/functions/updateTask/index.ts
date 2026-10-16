import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import { suggestTaskPriority } from "../../common/claude";
import { computeNextOccurrence, isValidRecurrence } from "../../common/taskRecurrence";
import type { Task, TaskPriority, TaskStatus } from "../../common/types";

const VALID_PRIORITIES: TaskPriority[] = ["Low", "Medium", "High"];
const VALID_STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];
const MAX_CATEGORY_LENGTH = 40;
const UPDATABLE_FIELDS = [
  "title",
  "description",
  "dueDate",
  "dueTime",
  "dueAtUtc",
  "estimatedHours",
  "priority",
  "status",
  "category",
  "scheduleTime",
  "recurrence",
] as const;

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
  if (body.recurrence !== undefined && !isValidRecurrence(body.recurrence)) {
    return errorResponse(
      400,
      "recurrence must be { frequency: 'daily'|'weekly'|'every_n_days'|'monthly', ... } with the field that frequency requires",
    );
  }
  if (body.category !== undefined && (typeof body.category !== "string" || body.category.length > MAX_CATEGORY_LENGTH)) {
    return errorResponse(400, `category must be a string up to ${MAX_CATEGORY_LENGTH} characters`);
  }

  // Completing a recurring task rolls it forward in place instead of actually finishing it —
  // one ongoing task, not a growing pile of done copies. Needs the task's current state
  // (recurrence, dueDate, dueTime) before building the update, since that's what the next
  // occurrence is computed from.
  let clearsDueAtUtc = false;
  if (body.status === "done") {
    const existing = await ddb.send(new GetCommand({ TableName: process.env.TASKS_TABLE_NAME, Key: { userId, taskId } }));
    const existingTask = existing.Item as Task | undefined;
    if (existingTask?.recurrence) {
      const today = new Date().toISOString().slice(0, 10);
      body.status = "todo";
      body.dueDate = computeNextOccurrence(existingTask.recurrence, existingTask.dueDate, today);
      // dueAtUtc is normally computed browser-side from the user's own local timezone — there's
      // no request-time context here to reconstruct it accurately for a date nobody actually
      // picked, so the stale one is removed rather than left pointing at the old occurrence or
      // guessed at. The reminder scheduler already skips tasks with no dueAtUtc, so this just
      // means no push reminder for this occurrence rather than a wrong-time one.
      delete body.dueAtUtc;
      clearsDueAtUtc = true;
    }
  }

  const updates = UPDATABLE_FIELDS.filter((field) => body[field] !== undefined);
  if (updates.length === 0 && !clearsDueAtUtc) return errorResponse(400, "No updatable fields provided");

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

  // Editing the due date/time invalidates any reminder already sent for the old time —
  // clear it so the scheduler can remind again for the new due time.
  const clearsReminder =
    updates.includes("dueAtUtc") || updates.includes("dueDate") || updates.includes("dueTime");
  const removeParts = [
    ...(clearsReminder ? ["reminderSentAt"] : []),
    ...(clearsDueAtUtc ? ["dueAtUtc"] : []),
  ];
  const updateExpression =
    removeParts.length > 0
      ? `SET ${setParts.join(", ")} REMOVE ${removeParts.join(", ")}`
      : `SET ${setParts.join(", ")}`;

  let task: Task;
  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: process.env.TASKS_TABLE_NAME,
        Key: { userId, taskId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: "attribute_exists(taskId)",
        ReturnValues: "ALL_NEW",
      }),
    );
    task = result.Attributes as Task;
  } catch (err) {
    if (err instanceof Error && err.name === "ConditionalCheckFailedException") {
      return errorResponse(404, "Task not found");
    }
    throw err;
  }

  // Re-suggesting priority is best-effort and runs against the just-updated fields
  // (e.g. a new due date/time or estimate) — on failure, the manual/updated priority
  // above is left as-is rather than blocking the update.
  if (body.suggestPriority === true) {
    try {
      const priority = await suggestTaskPriority(
        task.title,
        task.dueDate,
        task.dueTime,
        task.estimatedHours,
        task.dueAtUtc,
        task.description,
      );
      const updated = await ddb.send(
        new UpdateCommand({
          TableName: process.env.TASKS_TABLE_NAME,
          Key: { userId, taskId },
          UpdateExpression: "SET priority = :priority, prioritySource = :prioritySource",
          ExpressionAttributeValues: { ":priority": priority, ":prioritySource": "ai" },
          ReturnValues: "ALL_NEW",
        }),
      );
      task = updated.Attributes as Task;
    } catch (err) {
      console.error("Task priority re-suggestion failed (leaving priority as-is):", err);
    }
  }

  return jsonResponse(200, task);
};
