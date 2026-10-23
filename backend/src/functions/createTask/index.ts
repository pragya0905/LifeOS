import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import { suggestTaskPriority } from "../../common/claude";
import { checkBlockType, checkReminderLead } from "../../common/timelineFields";
import { isValidRecurrence } from "../../common/taskRecurrence";
import type { Task, TaskPriority, TaskStatus, PrioritySource } from "../../common/types";

const VALID_PRIORITIES: TaskPriority[] = ["Low", "Medium", "High"];
const VALID_STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];
const MAX_CATEGORY_LENGTH = 40;

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

  const description =
    typeof body.description === "string" && body.description.trim() ? body.description.trim() : undefined;

  const dueDate = typeof body.dueDate === "string" ? body.dueDate : undefined;
  const dueTime = typeof body.dueTime === "string" ? body.dueTime : undefined;
  // The browser computes this from dueDate+dueTime in its own local timezone (the server
  // has no way to know the user's timezone from dueDate/dueTime alone) — an unambiguous
  // instant the reminder scheduler can compare against directly, in UTC, no guessing.
  const dueAtUtc = typeof body.dueAtUtc === "string" ? body.dueAtUtc : undefined;
  const estimatedHours =
    typeof body.estimatedHours === "number" && Number.isFinite(body.estimatedHours)
      ? body.estimatedHours
      : undefined;
  const voiceInput = body.voiceInput === true;
  const status = VALID_STATUSES.includes(body.status as TaskStatus)
    ? (body.status as TaskStatus)
    : "todo";

  if (body.blockType !== undefined) {
    const err = checkBlockType(body.blockType);
    if (err) return errorResponse(400, err);
  }
  if (body.reminderLeadMinutes !== undefined) {
    const err = checkReminderLead(body.reminderLeadMinutes);
    if (err) return errorResponse(400, err);
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
  const category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : undefined;

  let priority: TaskPriority = VALID_PRIORITIES.includes(body.priority as TaskPriority)
    ? (body.priority as TaskPriority)
    : "Medium";
  let prioritySource: PrioritySource = "manual";

  // AI priority suggestion is best-effort: on any failure, fall back to the
  // manual/default priority above rather than blocking task creation.
  if (body.suggestPriority === true) {
    try {
      priority = await suggestTaskPriority(title, dueDate, dueTime, estimatedHours, dueAtUtc, description);
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
    description,
    dueDate,
    dueTime,
    dueAtUtc,
    estimatedHours,
    voiceInput,
    priority,
    prioritySource,
    status,
    category,
    scheduleTime: typeof body.scheduleTime === "string" ? body.scheduleTime : undefined,
    ...(isValidRecurrence(body.recurrence) ? { recurrence: body.recurrence } : {}),
    ...(body.blockType !== undefined ? { blockType: body.blockType as "task" | "protected" } : {}),
    ...(typeof body.reminderLeadMinutes === "number" ? { reminderLeadMinutes: body.reminderLeadMinutes } : {}),
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
