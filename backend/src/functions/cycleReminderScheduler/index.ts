import type { ScheduledHandler } from "aws-lambda";
import { QueryCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { sendPushNotification } from "../../common/pushNotifications";
import type { LogEntry, PushSubscription } from "../../common/types";

// Fires a few times a day — predictions are day-granularity, so unlike the 15-minute
// Wishes/Tasks schedulers this doesn't need tight polling. Mirrors their pattern
// otherwise: per-user scan of subscriptions, then per-user query of the relevant data.
const REMINDER_WINDOW_DAYS = 1;

function daysBetween(a: string, b: string): number {
  const d1 = new Date(`${a}T00:00:00Z`);
  const d2 = new Date(`${b}T00:00:00Z`);
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

// Mirrors frontend/src/pages/Cycle.tsx's predictNextCycle so the reminder fires on the
// same predicted date the user sees on the page.
function predictNextCycle(starts: string[]): string | null {
  if (starts.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < starts.length; i++) gaps.push(daysBetween(starts[i - 1], starts[i]));
  const avgCycleDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);

  const last = new Date(`${starts[starts.length - 1]}T00:00:00Z`);
  last.setUTCDate(last.getUTCDate() + avgCycleDays);
  return last.toISOString().slice(0, 10);
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

  const today = new Date().toISOString().slice(0, 10);

  for (const [userId, userSubs] of subsByUser) {
    const entriesResult = await ddb.send(
      new QueryCommand({
        TableName: process.env.LOG_ENTRIES_TABLE_NAME,
        KeyConditionExpression: "userId = :userId",
        FilterExpression: "logType = :logType AND #data.#event = :event",
        ExpressionAttributeNames: { "#data": "data", "#event": "event" },
        ExpressionAttributeValues: {
          ":userId": userId,
          ":logType": "cycle",
          ":event": "period_start",
        },
      }),
    );
    const starts = (entriesResult.Items ?? []) as LogEntry[];
    if (starts.length < 2) continue;

    const sorted = starts.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    const lastStart = sorted[sorted.length - 1];
    const nextPredicted = predictNextCycle(sorted.map((e) => e.date));
    if (!nextPredicted) continue;

    const daysUntil = daysBetween(today, nextPredicted);
    const alreadySent = lastStart.data.cycleReminderForDate === nextPredicted;
    if (alreadySent || daysUntil < 0 || daysUntil > REMINDER_WINDOW_DAYS) continue;

    await Promise.all(
      userSubs.map((sub) =>
        sendPushNotification(sub, {
          title: "Period predicted soon",
          body:
            daysUntil === 0
              ? "Your next period is predicted around today, based on your logged cycle."
              : `Your next period is predicted around ${nextPredicted}, based on your logged cycle.`,
        }).catch((err) => console.error(`Failed to send cycle reminder push for ${userId}:`, err)),
      ),
    );

    await ddb.send(
      new UpdateCommand({
        TableName: process.env.LOG_ENTRIES_TABLE_NAME,
        Key: { userId, logId: lastStart.logId },
        UpdateExpression: "SET #data.#sentAt = :now, #data.#forDate = :date",
        ExpressionAttributeNames: {
          "#data": "data",
          "#sentAt": "cycleReminderSentAt",
          "#forDate": "cycleReminderForDate",
        },
        ExpressionAttributeValues: { ":now": new Date().toISOString(), ":date": nextPredicted },
      }),
    );
  }
};
