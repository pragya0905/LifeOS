import { useEffect, type ReactNode, type RefObject } from "react";
import { Mic, Paperclip, Send, Square } from "lucide-react";
import { Icon } from "../Icon";

const MAX_TEXTAREA_HEIGHT = 128; // ~5 lines at text-sm before the composer scrolls internally

// Enter sends on desktop (a hardware keyboard, where Enter isn't the only way to get a
// newline); on a touch/mobile layout Enter just inserts a newline — matches the on-screen
// keyboard's own return key behavior instead of fighting it. Re-checked per keystroke (not
// cached) so it still does the right thing across a rotation or a resize.
function entersSend(): boolean {
  return window.matchMedia("(min-width: 768px)").matches;
}

export function AssistantComposer({
  value,
  onChange,
  onSubmit,
  sending,
  onStop,
  listening,
  voiceSupported,
  onToggleVoice,
  attachmentTray,
  hasContent,
  canSend,
  onAttachClick,
  onFocus,
  onBlur,
  textareaRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  sending: boolean;
  onStop: () => void;
  listening: boolean;
  voiceSupported: boolean;
  onToggleVoice: () => void;
  attachmentTray: ReactNode;
  // Text or any attachment in the tray — decides whether the send slot shows at all.
  hasContent: boolean;
  // Whether a send can go right now (no upload in flight, under the size cap, something to send).
  canSend: boolean;
  onAttachClick: () => void;
  onFocus: () => void;
  onBlur: () => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [value, textareaRef]);

  return (
    // The focus scope covers the whole composer, tray included. Tapping a chip's Retry or ×
    // is a tap inside the composer, not the composer losing focus — treating it as a blur
    // brings the tab bar back and shifts this block up under the finger.
    <div
      className="shrink-0 px-3 pb-2 pt-1.5"
      onFocus={onFocus}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onBlur();
      }}
      onMouseDown={(e) => {
        // A tap on any button here keeps focus in the textarea, so the keyboard stays put and
        // no blur (and so no layout shift) happens mid-tap. The button's click still fires.
        if ((e.target as Element).closest("button")) e.preventDefault();
      }}
    >
      <div className="mx-auto max-w-[720px]">
      {attachmentTray}

      <div className="flex items-end gap-1 rounded-sheet border border-stone bg-paper-card p-1.5 dark:border-stone-dark dark:bg-ink-bg-card">
        <button
          type="button"
          onClick={onAttachClick}
          aria-label="Attach photos or documents"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-stone/40 dark:text-mist-muted dark:hover:bg-stone-dark/40"
        >
          <Icon icon={Paperclip} size={18} />
        </button>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && entersSend()) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Message your assistant"
          rows={1}
          className="max-h-32 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none dark:text-paper dark:placeholder:text-mist-muted"
        />

        {sending ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition-colors hover:opacity-90 dark:bg-paper dark:text-ink"
          >
            <Icon icon={Square} size={15} strokeWidth={2.2} className="fill-current" />
          </button>
        ) : hasContent ? (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSend}
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bloom text-paper-card transition-colors hover:bg-bloom-light disabled:opacity-40 disabled:hover:bg-bloom"
          >
            <Icon icon={Send} size={16} strokeWidth={2} />
          </button>
        ) : voiceSupported ? (
          <button
            type="button"
            onClick={onToggleVoice}
            aria-label={listening ? "Stop listening" : "Start voice input"}
            aria-pressed={listening}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
              listening
                ? "bg-alert text-paper-card"
                : "text-ink-muted hover:bg-stone/40 dark:text-mist-muted dark:hover:bg-stone-dark/40"
            }`}
          >
            <Icon icon={Mic} size={18} />
          </button>
        ) : (
          <button
            type="button"
            disabled
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted opacity-40 dark:text-mist-muted"
          >
            <Icon icon={Send} size={16} strokeWidth={2} />
          </button>
        )}
      </div>

      <p className="hidden pt-1.5 text-center text-[11px] text-ink-muted md:block dark:text-mist-muted">
        Enter to send · Shift+Enter for a new line
      </p>
      </div>
    </div>
  );
}
