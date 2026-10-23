import type { ScheduledHandler } from "aws-lambda";
import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { scanAllPushSubscriptions, sendPushNotification } from "../../common/pushNotifications";
import { routineReminderDate } from "../../common/routineReminders";
import type { PushSubscription, RoutineTemplate } from "../../common/types";

// Same 15-minute cadence as the medication reminder. A routine's reminder fires when its start
// time (minus the optional lead) lands in the next window, in the user's own timezone.
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

  for (const [userId, userSubs] of subsByUser) {
    const routinesResult = await ddb.send(
      new QueryCommand({
        TableName: process.env.ROUTINE_TEMPLATES_TABLE_NAME,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
      }),
    );
    const routines = (routinesResult.Items ?? []) as RoutineTemplate[];

    for (const routine of routines) {
      const today = routineReminderDate(routine, now, WINDOW_MINUTES);
      if (!today) continue;

      const lead = routine.reminderLeadMinutes ?? 0;
      await Promise.all(
        userSubs.map((sub) =>
          sendPushNotification(sub, {
            title: "Routine reminder",
            body: lead > 0 ? `${routine.name} starts in ${lead} min.` : `${routine.name} is starting now.`,
          }).catch((err) => console.error(`Failed to send push for routine ${routine.routineId}:`, err)),
        ),
      );

      await ddb.send(
        new UpdateCommand({
          TableName: process.env.ROUTINE_TEMPLATES_TABLE_NAME,
          Key: { userId, routineId: routine.routineId },
          UpdateExpression: "SET lastReminderSentDate = :today",
          ExpressionAttributeValues: { ":today": today },
        }),
      );
    }
  }
};
