import { useState } from "react";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import { card, mutedText, primaryButton, secondaryButton, sectionLabel } from "./ui";

type PermissionState = NotificationPermission | "unsupported";

export default function PwaSettings() {
  const { canInstall, installed, promptInstall } = useInstallPrompt();
  const [permission, setPermission] = useState<PermissionState>(
    "Notification" in window ? Notification.permission : "unsupported",
  );

  async function requestPermission() {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
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
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink dark:text-cream">Notifications enabled</span>
            <button
              onClick={sendTestNotification}
              className={`${secondaryButton} px-3 py-1.5 text-xs`}
            >
              Send test
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
