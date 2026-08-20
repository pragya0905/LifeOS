import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse } from "../../common/http";
import { generateInsights } from "../../common/claude";
import type {
  HabitLog,
  LogEntry,
  Medication,
  MedicationLog,
  RoutineStepLog,
  RoutineTemplate,
  Task,
} from "../../common/types";

function dateRangeForPeriod(period: "day" | "week"): { from: string; to: string } {
  const to = new Date().toISOString().slice(0, 10);
  if (period === "day") return { from: to, to };
  const fromDate = new Date();
  fromDate.setUTCDate(fromDate.getUTCDate() - 6);
  return { from: fromDate.toISOString().slice(0, 10), to };
}

async function queryAll<T>(tableName: string, userId: string): Promise<T[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": userId },
    }),
  );
  return (result.Items ?? []) as T[];
}

async function queryByDateRange<T>(
  tableName: string,
  userId: string,
  from: string,
  to: string,
): Promise<T[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "userId = :userId",
      FilterExpression: "#date BETWEEN :from AND :to",
      ExpressionAttributeNames: { "#date": "date" },
      ExpressionAttributeValues: { ":userId": userId, ":from": from, ":to": to },
    }),
  );
  return (result.Items ?? []) as T[];
}

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const period = event.queryStringParameters?.period === "week" ? "week" : "day";
  const { from, to } = dateRangeForPeriod(period);

  const [habits, medicationLogs, routineLogs, logEntries, medications, routines, tasks] =
    await Promise.all([
      queryByDateRange<HabitLog>(process.env.HABITS_TABLE_NAME as string, userId, from, to),
      queryByDateRange<MedicationLog>(
        process.env.MEDICATION_LOGS_TABLE_NAME as string,
        userId,
        from,
        to,
      ),
      queryByDateRange<RoutineStepLog>(
        process.env.ROUTINE_LOGS_TABLE_NAME as string,
        userId,
        from,
        to,
      ),
      queryByDateRange<LogEntry>(process.env.LOG_ENTRIES_TABLE_NAME as string, userId, from, to),
      queryAll<Medication>(process.env.MEDICATIONS_TABLE_NAME as string, userId),
      queryAll<RoutineTemplate>(process.env.ROUTINE_TEMPLATES_TABLE_NAME as string, userId),
      queryAll<Task>(process.env.TASKS_TABLE_NAME as string, userId),
    ]);

  const medicationNames = new Map(medications.map((m) => [m.medicationId, m.name]));
  const routinesById = new Map(routines.map((r) => [r.routineId, r]));

  const lines: string[] = [`Period: ${period} covering ${from} to ${to}.`];

  if (habits.length > 0) {
    lines.push("Habit logs:");
    for (const h of habits) {
      lines.push(`- ${h.date}: ${h.habitType} ${h.value ?? 0}${h.unit ?? ""} (${h.status})`);
    }
  } else {
    lines.push("No water/exercise/steps logged in this period.");
  }

  if (medicationLogs.length > 0) {
    lines.push("Medication adherence:");
    for (const m of medicationLogs) {
      const name = medicationNames.get(m.medicationId) ?? "a medication";
      lines.push(`- ${m.date}: ${name} — ${m.status}`);
    }
  }

  if (routineLogs.length > 0) {
    lines.push("Routine steps:");
    for (const r of routineLogs) {
      const routine = routinesById.get(r.routineId);
      const stepName = routine?.steps[r.stepIndex] ?? "a step";
      lines.push(`- ${r.date}: ${routine?.name ?? "routine"} — ${stepName} (${r.status})`);
    }
  }

  if (logEntries.length > 0) {
    lines.push("Other logs (food, sleep, weight, mood, cycle, calls, expenses):");
    for (const e of logEntries) {
      lines.push(`- ${e.date} [${e.logType}]: ${JSON.stringify(e.data)}`);
    }
  }

  const pendingTasks = tasks.filter((t) => t.status !== "done");
  const overdueTasks = pendingTasks.filter((t) => t.dueDate && t.dueDate < to);
  lines.push(`Tasks: ${pendingTasks.length} pending total, ${overdueTasks.length} overdue.`);
  for (const t of overdueTasks.slice(0, 8)) {
    lines.push(`- Overdue: "${t.title}" (was due ${t.dueDate})`);
  }

  const insights = await generateInsights(period, lines.join("\n"));

  return jsonResponse(200, insights);
};
