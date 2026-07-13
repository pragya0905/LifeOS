import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import type { Task, TaskPriority } from "../../common/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITY_RANK: Record<TaskPriority, number> = { High: 0, Medium: 1, Low: 2 };

function compareTasks(a: Task, b: Task): number {
  if (a.scheduleTime && b.scheduleTime) return a.scheduleTime.localeCompare(b.scheduleTime);
  if (a.scheduleTime && !b.scheduleTime) return -1;
  if (!a.scheduleTime && b.scheduleTime) return 1;
  const priorityDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (priorityDiff !== 0) return priorityDiff;
  return a.title.localeCompare(b.title);
}

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const date = event.pathParameters?.date ?? "";
  if (!DATE_RE.test(date)) return errorResponse(400, "date must be YYYY-MM-DD");

  const [tasksResult, habitsResult] = await Promise.all([
    ddb.send(
      new QueryCommand({
        TableName: process.env.TASKS_TABLE_NAME,
        KeyConditionExpression: "userId = :userId",
        FilterExpression: "dueDate = :date",
        ExpressionAttributeValues: { ":userId": userId, ":date": date },
      }),
    ),
    ddb.send(
      new QueryCommand({
        TableName: process.env.HABITS_TABLE_NAME,
        KeyConditionExpression: "userId = :userId AND begins_with(dateHabitType, :prefix)",
        ExpressionAttributeValues: { ":userId": userId, ":prefix": `${date}#` },
      }),
    ),
  ]);

  const tasks = ((tasksResult.Items ?? []) as Task[]).sort(compareTasks);

  return jsonResponse(200, {
    date,
    tasks,
    habits: habitsResult.Items ?? [],
  });
};
