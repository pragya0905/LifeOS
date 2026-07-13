import { useState } from "react";
import { useInstallPrompt } from "../hooks/useInstallPrompt";

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
    <div className="rounded-md border border-gray-200 p-4 dark:border-gray-700">
      <h2 className="mb-3 text-sm font-medium text-gray-500 dark:text-gray-400">App</h2>
      <div className="flex flex-col gap-3">
        {!installed && canInstall && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700 dark:text-gray-300">Install LifeOs as an app</span>
            <button
              onClick={promptInstall}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
            >
              Install
            </button>
          </div>
        )}
        {installed && (
          <p className="text-sm text-gray-500 dark:text-gray-400">Installed as an app</p>
        )}

        {permission === "unsupported" && (
          <p className="text-sm text-gray-400">Notifications aren't supported in this browser.</p>
        )}
        {permission === "default" && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700 dark:text-gray-300">Enable notifications</span>
            <button
              onClick={requestPermission}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Enable
            </button>
          </div>
        )}
        {permission === "denied" && (
          <p className="text-sm text-gray-400">
            Notifications are blocked — enable them in your browser's site settings.
          </p>
        )}
        {permission === "granted" && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700 dark:text-gray-300">Notifications enabled</span>
            <button
              onClick={sendTestNotification}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Send test
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
