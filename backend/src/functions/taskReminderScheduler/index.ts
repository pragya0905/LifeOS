import type { ScheduledHandler } from "aws-lambda";
import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { scanAllPushSubscriptions, sendPushNotification } from "../../common/pushNotifications";
import type { PushSubscription, Task } from "../../common/types";

// Fires every 15 minutes (see the Schedule event in template.yaml). A task is reminded
// once, right when its due-at instant falls inside the window this run covers — using
// dueAtUtc (an unambiguous instant the browser computed, not a reconstructed guess) is
// what makes this safe to run on a fixed cadence without double- or never-firing.
const WINDOW_MINUTES = 15;

export const handler: ScheduledHandler = async () => {
  const subscriptions = await scanAllPushSubscriptions();
  if (subscriptions.length === 0) return;

  const subsByUser = new Map<string, PushSubscription[]>();
  for (const sub of subscriptions) {
    const list = subsByUser.get(sub.userId) ?? [];
    list.push(sub);
    subsByUser.set(sub.userId, list);
  }

  const now = new Date();
  const windowEnd = new Date(now.getTime() + WINDOW_MINUTES * 60000);

  for (const [userId, userSubs] of subsByUser) {
    const tasksResult = await ddb.send(
      new QueryCommand({
        TableName: process.env.TASKS_TABLE_NAME,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
      }),
    );
    const tasks = (tasksResult.Items ?? []) as Task[];

    for (const task of tasks) {
      if (task.status === "done" || task.reminderSentAt || !task.dueAtUtc) continue;
      const dueAt = new Date(task.dueAtUtc);
      if (dueAt < now || dueAt > windowEnd) continue;

      for (const sub of userSubs) {
        try {
          await sendPushNotification(sub, {
            title: "Task due soon",
            body: `"${task.title}" is due${task.dueTime ? ` at ${task.dueTime}` : " soon"}`,
          });
        } catch (err) {
          console.error(`Failed to send push notification for task ${task.taskId}:`, err);
        }
      }

      await ddb.send(
        new UpdateCommand({
          TableName: process.env.TASKS_TABLE_NAME,
          Key: { userId, taskId: task.taskId },
          UpdateExpression: "SET reminderSentAt = :now",
          ExpressionAttributeValues: { ":now": now.toISOString() },
        }),
      );
    }
  }
};
