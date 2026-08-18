import type { ScheduledHandler } from "aws-lambda";
import { QueryCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { sendPushNotification } from "../../common/pushNotifications";
import type { PushSubscription, Wish } from "../../common/types";

// Fires every 15 minutes alongside the task reminder scheduler (kept as a separate
// function since Wishes is a distinct table/domain — same pattern, different data).
const DEADLINE_WINDOW_HOURS = 24;

function progressFraction(wish: Wish): number | null {
  switch (wish.progressMode) {
    case "percentage":
      return wish.percentage !== undefined ? wish.percentage / 100 : null;
    case "milestone":
      if (!wish.milestones || wish.milestones.length === 0) return null;
      return wish.milestones.filter((m) => m.done).length / wish.milestones.length;
    case "quantity":
      if (!wish.quantityTarget) return null;
      return Math.min((wish.quantityCurrent ?? 0) / wish.quantityTarget, 1);
    default:
      // time_based has no progress distinct from elapsed time; habit_linked is checked
      // separately since it needs a habit-log query, not worth it for a once-ever warning.
      return null;
  }
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
  const deadlineWindowEnd = new Date(now.getTime() + DEADLINE_WINDOW_HOURS * 60 * 60000);

  for (const [userId, userSubs] of subsByUser) {
    const wishesResult = await ddb.send(
      new QueryCommand({
        TableName: process.env.WISHES_TABLE_NAME,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
      }),
    );
    const wishes = (wishesResult.Items ?? []) as Wish[];

    for (const wish of wishes) {
      if (wish.status !== "active" || !wish.targetDate) continue;
      const targetAt = new Date(`${wish.targetDate}T23:59:59.000Z`);

      const notify = async (title: string, body: string) => {
        await Promise.all(
          userSubs.map((sub) =>
            sendPushNotification(sub, { title, body }).catch((err) =>
              console.error(`Failed to send push for wish ${wish.wishId}:`, err),
            ),
          ),
        );
      };

      // Deadline countdown: due within the next 24 hours, not already reminded.
      if (!wish.deadlineReminderSentAt && targetAt >= now && targetAt <= deadlineWindowEnd) {
        await notify("Wish deadline approaching", `"${wish.title}" is due ${wish.targetDate}.`);
        await ddb.send(
          new UpdateCommand({
            TableName: process.env.WISHES_TABLE_NAME,
            Key: { userId, wishId: wish.wishId },
            UpdateExpression: "SET deadlineReminderSentAt = :now",
            ExpressionAttributeValues: { ":now": now.toISOString() },
          }),
        );
      }

      // Fall-behind warning: sent once, ever, per wish — not a nag on every pass.
      if (!wish.fallBehindWarningSentAt) {
        const created = new Date(wish.createdAt);
        const totalMs = targetAt.getTime() - created.getTime();
        if (totalMs > 0) {
          const elapsedFraction = Math.min((now.getTime() - created.getTime()) / totalMs, 1);
          const progress = progressFraction(wish);
          if (progress !== null && elapsedFraction > 0.5 && elapsedFraction - progress > 0.3) {
            await notify(
              "Falling behind on a wish",
              `"${wish.title}" is ${Math.round(elapsedFraction * 100)}% of the way to its deadline but only ${Math.round(progress * 100)}% done.`,
            );
            await ddb.send(
              new UpdateCommand({
                TableName: process.env.WISHES_TABLE_NAME,
                Key: { userId, wishId: wish.wishId },
                UpdateExpression: "SET fallBehindWarningSentAt = :now",
                ExpressionAttributeValues: { ":now": now.toISOString() },
              }),
            );
          }
        }
      }
    }
  }
};
