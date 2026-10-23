import { useRegisterSW } from "virtual:pwa-register/react";
import { primaryButton, secondaryButton } from "./ui";

// Shown when a new version has installed and is waiting. Updating reloads the app, so it is only
// done when the user asks: an open form is never lost behind their back.
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 top-3 z-50 mx-auto flex max-w-md flex-wrap items-center justify-between gap-3 rounded-xl border border-stone bg-paper-card px-4 py-3 shadow-md dark:border-stone-dark dark:bg-ink-bg-card"
    >
      <p className="text-sm text-ink dark:text-paper">A new version of LifeOs is ready.</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => setNeedRefresh(false)} className={`${secondaryButton} min-h-10 px-3 text-sm`}>
          Later
        </button>
        <button type="button" onClick={() => updateServiceWorker(true)} className={`${primaryButton} min-h-10 px-3 text-sm`}>
          Update
        </button>
      </div>
    </div>
  );
}
