import { useEffect, useState } from "react";
import { useApi } from "../api/useApi";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import { card, errorText, mutedText, primaryButton, secondaryButton, sectionLabel } from "./ui";

type PermissionState = NotificationPermission | "unsupported";

// PushManager.subscribe needs the VAPID public key as a raw Uint8Array, not the
// URL-safe base64 string it's distributed as.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

export default function PwaSettings() {
  const { request } = useApi();
  const { canInstall, installed, promptInstall } = useInstallPrompt();
  const [permission, setPermission] = useState<PermissionState>(
    "Notification" in window ? Notification.permission : "unsupported",
  );
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    let ignore = false;
    async function checkExisting() {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (!ignore) setPushSubscribed(existing !== null);
    }
    checkExisting();
    return () => {
      ignore = true;
    };
  }, []);

  async function subscribeToPush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const vapidPublicKey = import.meta.env.VITE_PUSH_VAPID_PUBLIC_KEY as string | undefined;
    if (!vapidPublicKey) return;

    setSubscribing(true);
    setPushError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));
      const json = subscription.toJSON();
      await request("/push-subscriptions", {
        method: "POST",
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      setPushSubscribed(true);
    } catch (err) {
      setPushError(err instanceof Error ? err.message : "Failed to enable reminders");
    } finally {
      setSubscribing(false);
    }
  }

  async function requestPermission() {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") await subscribeToPush();
  }

  async function sendTestNotification() {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification("LifeOs", {
      body: "Notifications are working — this is a local test, not a real push.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    });
  }

  return (
    <div className={card}>
      <h2 className={`mb-3 ${sectionLabel}`}>App</h2>
      <div className="flex flex-col gap-3">
        {!installed && canInstall && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink dark:text-cream">Install LifeOs as an app</span>
            <button onClick={promptInstall} className={`${primaryButton} px-3 py-1.5 text-xs`}>
              Install
            </button>
          </div>
        )}
        {installed && <p className={mutedText}>Installed as an app</p>}

        {permission === "unsupported" && (
          <p className={mutedText}>Notifications aren't supported in this browser.</p>
        )}
        {permission === "default" && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink dark:text-cream">Enable notifications</span>
            <button
              onClick={requestPermission}
              className={`${secondaryButton} px-3 py-1.5 text-xs`}
            >
              Enable
            </button>
          </div>
        )}
        {permission === "denied" && (
          <p className={mutedText}>
            Notifications are blocked — enable them in your browser's site settings.
          </p>
        )}
        {permission === "granted" && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink dark:text-cream">Notifications enabled</span>
              <button
                onClick={sendTestNotification}
                className={`${secondaryButton} px-3 py-1.5 text-xs`}
              >
                Send test
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink dark:text-cream">
                {pushSubscribed ? "Task due-date reminders on" : "Task due-date reminders"}
              </span>
              {!pushSubscribed && (
                <button
                  onClick={subscribeToPush}
                  disabled={subscribing}
                  className={`${secondaryButton} px-3 py-1.5 text-xs`}
                >
                  {subscribing ? "Enabling..." : "Enable"}
                </button>
              )}
            </div>
            {pushError && <p className={errorText}>{pushError}</p>}
          </>
        )}
      </div>
    </div>
  );
}
