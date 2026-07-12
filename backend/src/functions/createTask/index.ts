import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import { suggestTaskPriority } from "../../common/claude";
import type { Task, TaskPriority, TaskStatus, PrioritySource } from "../../common/types";

const VALID_PRIORITIES: TaskPriority[] = ["Low", "Medium", "High"];
const VALID_STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];

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

  const dueDate = typeof body.dueDate === "string" ? body.dueDate : undefined;
  const status = VALID_STATUSES.includes(body.status as TaskStatus)
    ? (body.status as TaskStatus)
    : "todo";

  let priority: TaskPriority = VALID_PRIORITIES.includes(body.priority as TaskPriority)
    ? (body.priority as TaskPriority)
    : "Medium";
  let prioritySource: PrioritySource = "manual";

  // AI priority suggestion is best-effort: on any failure, fall back to the
  // manual/default priority above rather than blocking task creation.
  if (body.suggestPriority === true) {
    try {
      priority = await suggestTaskPriority(title, dueDate);
      prioritySource = "ai";
    } catch (err) {
      console.error("Task priority suggestion failed (falling back to manual):", err);
    }
  }

  const now = new Date().toISOString();
  const task: Task = {
    userId,
    taskId: randomUUID(),
    title,
    dueDate,
    priority,
    prioritySource,
    status,
    scheduleTime: typeof body.scheduleTime === "string" ? body.scheduleTime : undefined,
    createdAt: now,
    updatedAt: now,
  };

  await ddb.send(
    new PutCommand({
      TableName: process.env.TASKS_TABLE_NAME,
      Item: task,
    }),
  );

  return jsonResponse(201, task);
};
