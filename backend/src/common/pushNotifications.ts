import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import webpush from "web-push";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "./dynamo";
import type { PushSubscription } from "./types";

let cachedPrivateKey: string | undefined;
let vapidConfigured = false;

async function ensureVapidConfigured(): Promise<void> {
  if (vapidConfigured) return;
  if (!cachedPrivateKey) {
    const ssm = new SSMClient({});
    const result = await ssm.send(
      new GetParameterCommand({
        Name: process.env.PUSH_VAPID_PRIVATE_KEY_PARAM,
        WithDecryption: true,
      }),
    );
    if (!result.Parameter?.Value) {
      throw new Error("Push VAPID private key parameter is empty");
    }
    cachedPrivateKey = result.Parameter.Value;
  }
  webpush.setVapidDetails(
    "mailto:noreply@lifeos.app",
    process.env.PUSH_VAPID_PUBLIC_KEY as string,
    cachedPrivateKey,
  );
  vapidConfigured = true;
}

// Sends one push notification, removing the subscription if the push service
// reports it as gone (410) or not found (404) — a normal, expected outcome
// when a browser/device unsubscribes or a service worker is uninstalled.
export async function sendPushNotification(
  subscription: PushSubscription,
  payload: { title: string; body: string },
): Promise<void> {
  await ensureVapidConfigured();
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      JSON.stringify(payload),
    );
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await ddb.send(
        new DeleteCommand({
          TableName: process.env.PUSH_SUBSCRIPTIONS_TABLE_NAME,
          Key: { userId: subscription.userId, endpoint: subscription.endpoint },
        }),
      );
      return;
    }
    throw err;
  }
}
