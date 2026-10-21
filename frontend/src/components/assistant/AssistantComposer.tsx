import { useEffect, type RefObject } from "react";
import { Mic, Paperclip, Send, Square, X } from "lucide-react";
import { Icon } from "../Icon";

const MAX_TEXTAREA_HEIGHT = 128; // ~5 lines at text-sm before the composer scrolls internally

// Enter sends on desktop (a hardware keyboard, where Enter isn't the only way to get a
// newline); on a touch/mobile layout Enter just inserts a newline — matches the on-screen
// keyboard's own return key behavior instead of fighting it. Re-checked per keystroke (not
// cached) so it still does the right thing across a rotation or a resize.
function entersSend(): boolean {
  return window.matchMedia("(min-width: 768px)").matches;
}

interface PendingAttachment {
  key: string;
  contentType: string;
  fileName: string;
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
  attaching,
  pendingAttachment,
  onAttachClick,
  onRemoveAttachment,
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
  attaching: boolean;
  pendingAttachment: PendingAttachment | null;
  onAttachClick: () => void;
  onRemoveAttachment: () => void;
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

  const canSend = value.trim().length > 0 || pendingAttachment !== null;

  return (
    <div className="shrink-0 px-3 pb-2 pt-1.5">
      <div className="mx-auto max-w-[720px]">
      {pendingAttachment && (
        <div className="mb-1.5 flex items-center gap-2 px-1 text-xs text-ink-muted dark:text-mist-muted">
          <Icon icon={Paperclip} size={12} />
          <span className="min-w-0 flex-1 truncate">{pendingAttachment.fileName}</span>
          <button
            type="button"
            onClick={onRemoveAttachment}
            aria-label="Remove attachment"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-stone/40 dark:text-mist-muted dark:hover:bg-stone-dark/40"
          >
            <Icon icon={X} size={12} />
          </button>
        </div>
      )}

      <div
        className="flex items-end gap-1 rounded-sheet border border-stone bg-paper-card p-1.5 dark:border-stone-dark dark:bg-ink-bg-card"
        onFocus={onFocus}
        onBlur={(e) => {
          // Tapping Send/Stop/Mic/Attach moves focus from the textarea to one of this same
          // row's own buttons — that's not a real "composer lost focus" event, and treating it
          // as one restored the tab bar / reserved padding mid-tap, shifting this row's layout
          // out from under the tap before the click could land. Only a focus move to something
          // outside this row counts.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onBlur();
        }}
      >
        <button
          type="button"
          onClick={onAttachClick}
          disabled={attaching}
          aria-label="Attach a photo or document"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-stone/40 disabled:opacity-50 dark:text-mist-muted dark:hover:bg-stone-dark/40"
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
        ) : canSend ? (
          <button
            type="button"
            onClick={onSubmit}
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bloom text-paper-card transition-colors hover:bg-bloom-light"
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
