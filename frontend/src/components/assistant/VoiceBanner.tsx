import { Mic, MicOff, X } from "lucide-react";
import { Icon } from "../Icon";
import type { EndReason } from "../../lib/voiceMachine";

// Shown above the composer when voice is not on screen but the session matters: you switched to
// typing and can bring voice back, or it ended by itself and says why.
export function VoiceBanner({
  mode,
  endReason,
  onResume,
  onStartAgain,
  onDismiss,
}: {
  mode: "typing" | "ended";
  endReason: EndReason | null;
  onResume: () => void;
  onStartAgain: () => void;
  onDismiss: () => void;
}) {
  const action = "flex h-11 min-w-11 shrink-0 items-center gap-1.5 rounded-control px-3 text-sm font-semibold text-[#c93a29] hover:bg-stone/40 dark:text-bloom-light dark:hover:bg-stone-dark/40";
  return (
    <div
      role="status"
      // A tap here keeps focus where it is. If the composer lost focus first, the tab bar would
      // come back and move this banner out from under the finger before the tap completed.
      onMouseDown={(e) => e.preventDefault()}
      className="mx-3 mb-1.5 flex shrink-0 items-center justify-between gap-1 rounded-control border border-stone bg-amber-soft py-0.5 pl-3 pr-1 text-[13px] text-ink dark:border-stone-dark dark:bg-amber-soft-dark dark:text-paper"
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon icon={MicOff} size={14} className="shrink-0" />
        {mode === "typing"
          ? "Voice paused. Your chat stays here."
          : endReason === "pause-timeout"
            ? "Voice ended after 5 minutes paused."
            : "Voice ended: I didn't hear anything twice."}
      </span>
      <span className="flex shrink-0 items-center">
        <button type="button" onClick={mode === "typing" ? onResume : onStartAgain} className={action}>
          <Icon icon={Mic} size={16} />
          {mode === "typing" ? "Resume voice" : "Start again"}
        </button>
        {mode === "ended" && (
          <button type="button" onClick={onDismiss} aria-label="Dismiss" className="flex h-11 w-11 items-center justify-center rounded-full text-ink-muted hover:bg-stone/40 dark:text-mist-muted dark:hover:bg-stone-dark/40">
            <Icon icon={X} size={16} />
          </button>
        )}
      </span>
    </div>
  );
}
