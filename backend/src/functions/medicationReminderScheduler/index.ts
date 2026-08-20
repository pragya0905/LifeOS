import type { ScheduledHandler } from "aws-lambda";
import { GetCommand, QueryCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { sendPushNotification } from "../../common/pushNotifications";
import { computeEndDate } from "../../common/medications";
import type { Medication, MedicationLog, PushSubscription } from "../../common/types";

// Fires every 15 minutes, same cadence as the Task/Wish schedulers. A medication's
// timeOfDay is a bare "HH:MM" the user picked in their own local time, paired with the
// timezoneOffsetMinutes the browser reported at creation time (JS getTimezoneOffset()
// convention: minutes to ADD to local time to reach UTC) — this lets the scheduler
// reconstruct today's target UTC instant without guessing the user's timezone, the same
// principle behind Tasks' dueAtUtc.
const WINDOW_MINUTES = 15;

function todayUtcDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function targetUtcInstant(dateStr: string, timeOfDay: string, timezoneOffsetMinutes: number): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeOfDay.split(":").map(Number);
  const localAsUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  return new Date(localAsUtcMs + timezoneOffsetMinutes * 60000);
}

export const handler: ScheduledHandler = async () => {
  const subsResult = await ddb.send(
    new ScanCommand({ TableName: process.env.PUSH_SUBSCRIPTIONS_TABLE_NAME }),
  );
  const subscriptions = (subsResult.Items ?? []) as PushSubscription[];
  if (subscriptions.length === 0) return;

  const subsByUser = new Map<string, PushSubscription[]>();
  for (const sub of subscriptions) {
    const list = subsByUser.get(sub.userId) ?? [];
    list.push(sub);
    subsByUser.set(sub.userId, list);
  }

  const now = new Date();
  const windowEnd = new Date(now.getTime() + WINDOW_MINUTES * 60000);
  const today = todayUtcDateStr();

  for (const [userId, userSubs] of subsByUser) {
    const medsResult = await ddb.send(
      new QueryCommand({
        TableName: process.env.MEDICATIONS_TABLE_NAME,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
      }),
    );
    const medications = (medsResult.Items ?? []) as Medication[];

    for (const medication of medications) {
      if (!medication.timeOfDay || medication.timezoneOffsetMinutes === undefined) continue;
      if (medication.lastReminderSentDate === today) continue;

      const endDate = computeEndDate(medication.startDate, medication.durationDays);
      if (today < medication.startDate || today > endDate) continue;

      const target = targetUtcInstant(today, medication.timeOfDay, medication.timezoneOffsetMinutes);
      if (target < now || target > windowEnd) continue;

      const existingLog = await ddb.send(
        new GetCommand({
          TableName: process.env.MEDICATION_LOGS_TABLE_NAME,
          Key: { userId, dateMedicationId: `${today}#${medication.medicationId}` },
        }),
      );
      if ((existingLog.Item as MedicationLog | undefined)?.status === "taken") continue;

      await Promise.all(
        userSubs.map((sub) =>
          sendPushNotification(sub, {
            title: "Medication reminder",
            body: `Time to take ${medication.name}${medication.dosage ? ` (${medication.dosage})` : ""}.`,
          }).catch((err) => console.error(`Failed to send push for medication ${medication.medicationId}:`, err)),
        ),
      );

      await ddb.send(
        new UpdateCommand({
          TableName: process.env.MEDICATIONS_TABLE_NAME,
          Key: { userId, medicationId: medication.medicationId },
          UpdateExpression: "SET lastReminderSentDate = :today",
          ExpressionAttributeValues: { ":today": today },
        }),
      );
    }
  }
};
