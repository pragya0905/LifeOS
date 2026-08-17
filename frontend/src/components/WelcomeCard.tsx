import { useState } from "react";
import { Link } from "react-router-dom";
import { badge, card, mutedText, secondaryButton } from "./ui";

const DISMISSED_KEY = "lifeos-welcome-dismissed";

export default function WelcomeCard() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === "true",
  );

  if (dismissed) return null;

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
  }

  return (
    <div className={`mb-6 flex items-start justify-between gap-4 ${card}`}>
      <div>
        <span className={badge}>Welcome</span>
        <p className="mt-2 text-sm text-ink dark:text-cream">
          LifeOs tracks habits, tasks, and journal entries in one place. There are two ways to
          log something: type or dictate it in{" "}
          <Link to="/journal" className="text-sage hover:underline">
            Journal
          </Link>{" "}
          and AI fills in the matching fields automatically, or edit values directly in
          Today's habits below.
        </p>
        <p className={`mt-1 ${mutedText}`}>
          The Extraction Ledger further down shows exactly what the AI picked up from your last
          journal entry — a manually-entered value always takes priority over one from AI.
        </p>
      </div>
      <button type="button" onClick={dismiss} className={`${secondaryButton} shrink-0 px-2 py-1 text-xs`}>
        Got it
      </button>
    </div>
  );
}
