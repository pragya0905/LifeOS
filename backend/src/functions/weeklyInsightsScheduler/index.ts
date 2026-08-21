import type { ScheduledHandler } from "aws-lambda";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { scanAllPushSubscriptions, sendPushNotification } from "../../common/pushNotifications";
import { generateInsightsForUser } from "../../common/insights";
import type { PushSubscription, UserProfile } from "../../common/types";

// Fires once a day (see the Schedule event in template.yaml) and sends each user their AI
// weekly summary as a push roughly once every 7 days — gated by lastWeeklyDigestSentAt on
// their profile rather than a fixed calendar day, so it doesn't matter what day the scheduler
// happens to run on relative to when a user signed up.
const DIGEST_INTERVAL_DAYS = 7;
const PUSH_BODY_MAX_LENGTH = 180;

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
    const profileResult = await ddb.send(
      new GetCommand({ TableName: process.env.USER_PROFILE_TABLE_NAME, Key: { userId } }),
    );
    const profile = profileResult.Item as UserProfile | undefined;

    if (profile?.lastWeeklyDigestSentAt) {
      const daysSince = (now.getTime() - new Date(profile.lastWeeklyDigestSentAt).getTime()) / 86400000;
      if (daysSince < DIGEST_INTERVAL_DAYS) continue;
    }

    try {
      const insights = await generateInsightsForUser(userId, "week");
      const body =
        insights.summary.length > PUSH_BODY_MAX_LENGTH
          ? `${insights.summary.slice(0, PUSH_BODY_MAX_LENGTH - 1)}…`
          : insights.summary;

      await Promise.all(
        userSubs.map((sub) =>
          sendPushNotification(sub, { title: "Your weekly summary", body }).catch((err) =>
            console.error(`Failed to send weekly digest push for ${userId}:`, err),
          ),
        ),
      );

      await ddb.send(
        new UpdateCommand({
          TableName: process.env.USER_PROFILE_TABLE_NAME,
          Key: { userId },
          UpdateExpression:
            "SET lastWeeklyDigestSentAt = :now, updatedAt = if_not_exists(updatedAt, :now)",
          ExpressionAttributeValues: { ":now": now.toISOString() },
        }),
      );
    } catch (err) {
      console.error(`Failed to generate weekly digest for ${userId}:`, err);
    }
  }
};
