import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import type { Task, TaskPriority, TaskStatus } from "../../common/types";

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

  const priority = VALID_PRIORITIES.includes(body.priority as TaskPriority)
    ? (body.priority as TaskPriority)
    : "Medium";
  const status = VALID_STATUSES.includes(body.status as TaskStatus)
    ? (body.status as TaskStatus)
    : "todo";

  const now = new Date().toISOString();
  const task: Task = {
    userId,
    taskId: randomUUID(),
    title,
    dueDate: typeof body.dueDate === "string" ? body.dueDate : undefined,
    priority,
    prioritySource: "manual",
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
