import type { ReactNode } from "react";
import {
  AlertCircle,
  Clock,
  Keyboard,
  Lock,
  Mic,
  MicOff,
  RotateCcw,
  Square,
  Sun,
  Volume2,
  VolumeX,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import { Icon } from "../Icon";
import { AssistantToolCards } from "./AssistantToolCards";
import { PAUSE_TIMEOUT_MS, type VoiceErrorKind, type VoiceLang, type VoiceState, type VoiceStatus } from "../../lib/voiceMachine";
import type { ToolResultEntry } from "../../lib/toolCards";

// Variant A: the voice screen takes over. A large orb, big captions, and four controls in the
// thumb zone at the bottom. Every state is an icon plus a word; every target is 44px or larger.

const LANGS: { code: VoiceLang; label: string; htmlLang: string }[] = [
  { code: "en-IN", label: "EN-IN", htmlLang: "en-IN" },
  { code: "hi-IN", label: "हिन्दी", htmlLang: "hi-IN" },
];

const ORB_BASE = "relative grid h-32 w-32 place-items-center rounded-full";

const STATUS_LINE: Record<VoiceStatus, { icon: LucideIcon; word: string; tone: string } | null> = {
  closed: null,
  ended: null,
  typing: null,
  listening: { icon: Mic, word: "Listening", tone: "text-ink dark:text-paper" },
  thinking: { icon: Clock, word: "Thinking", tone: "text-ink-muted dark:text-mist-muted" },
  speaking: { icon: Volume2, word: "Speaking", tone: "text-ink dark:text-paper" },
  paused: { icon: MicOff, word: "Mic paused", tone: "text-ink-muted dark:text-mist-muted" },
  error: { icon: AlertCircle, word: "Voice stopped", tone: "text-alert dark:text-alert-light" },
};

const controlBase =
  "flex min-h-14 min-w-11 flex-col items-center justify-center gap-0.5 rounded-control border px-1 text-xs font-semibold transition-colors disabled:opacity-50";
const controlPlain = `${controlBase} border-stone bg-paper-card text-ink hover:bg-stone/40 dark:border-stone-dark dark:bg-ink-bg-card dark:text-paper dark:hover:bg-stone-dark/40`;
const controlFill = `${controlBase} border-transparent bg-[#c93a29] text-white hover:opacity-90 dark:bg-bloom-light dark:text-ink-bg`;
const wideAction =
  "flex min-h-12 w-full items-center justify-center gap-2 rounded-control border border-stone bg-paper-card text-sm font-semibold text-[#c93a29] transition-colors hover:bg-stone/40 dark:border-stone-dark dark:bg-ink-bg-card dark:text-bloom-light dark:hover:bg-stone-dark/40";

function Orb({ status, onTap }: { status: VoiceStatus; onTap: () => void }) {
  const interactive = status === "listening" || status === "paused";
  const surface =
    status === "paused" || status === "error"
      ? "border border-stone bg-paper-card text-ink-muted dark:border-stone-dark dark:bg-ink-bg-card dark:text-mist-muted"
      : status === "thinking"
        ? "bg-[radial-gradient(circle_at_35%_30%,#6c5f75,#4a3f55_65%,#3b3146)] text-white"
        : "bg-[radial-gradient(circle_at_35%_30%,#ff9d8f,#ff6f5e_62%,#d9473a)] text-white";

  const inner =
    status === "speaking" ? (
      <span className="flex h-9 items-center gap-1" aria-hidden="true">
        {[14, 28, 20, 32, 12].map((h, i) => (
          <i key={i} className="w-[5px] rounded-sm bg-white motion-safe:animate-pulse" style={{ height: h, animationDelay: `${i * 0.12}s` }} />
        ))}
      </span>
    ) : (
      <Icon icon={status === "thinking" ? Clock : status === "paused" ? MicOff : status === "error" ? AlertCircle : Mic} size={40} />
    );

  const body = (
    <>
      {status === "listening" && (
        <>
          <span aria-hidden="true" className="absolute -inset-3 rounded-full border-2 border-bloom/50 motion-safe:animate-ping" />
          <span aria-hidden="true" className="absolute -inset-6 rounded-full border-2 border-bloom/25 motion-safe:animate-ping [animation-delay:0.6s]" />
        </>
      )}
      {status === "thinking" && (
        <span aria-hidden="true" className="absolute -inset-2.5 rounded-full border-2 border-dashed border-ink-muted motion-safe:animate-[spin_5s_linear_infinite] dark:border-mist-muted" />
      )}
      {inner}
    </>
  );

  return interactive ? (
    <button
      type="button"
      onClick={onTap}
      aria-label={status === "listening" ? "Pause the microphone" : "Resume listening"}
      className={`${ORB_BASE} ${surface} focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bloom`}
    >
      {body}
    </button>
  ) : (
    <div className={`${ORB_BASE} ${surface}`}>{body}</div>
  );
}

function ErrorPanel({
  kind,
  message,
  onRetry,
  onType,
}: {
  kind: VoiceErrorKind;
  message: string | null;
  onRetry: () => void;
  onType: () => void;
}) {
  const copy: Record<VoiceErrorKind, { icon: LucideIcon; title: string; body: ReactNode; retry: string; retryIcon: LucideIcon }> = {
    offline: {
      icon: WifiOff,
      title: "You're offline",
      body: "Voice needs a connection: the browser sends your speech to Google to turn it into text.",
      retry: "Retry",
      retryIcon: RotateCcw,
    },
    "no-speech": {
      icon: MicOff,
      title: "I didn't hear anything",
      body: "Check nothing is covering the microphone. I'll end voice if I don't hear you once more.",
      retry: "Try again",
      retryIcon: Mic,
    },
    permission: {
      icon: Lock,
      title: "Microphone is blocked",
      body: "Voice needs the microphone. Open the app's info (long-press its icon), tap Permissions, then Microphone, and choose Allow. In a browser tab, tap the lock beside the address.",
      retry: "I've allowed it",
      retryIcon: RotateCcw,
    },
    stt: {
      icon: AlertCircle,
      title: "Couldn't turn that into text",
      body: "The speech service didn't return a result, so nothing was sent. Say it again, or type it.",
      retry: "Retry",
      retryIcon: RotateCcw,
    },
    assistant: {
      icon: AlertCircle,
      title: "The assistant didn't answer",
      body: (
        <>
          {message ? `${message} ` : ""}Your words are kept, so Retry sends them again. If you asked it to add something, check the list first: it may have been saved.
        </>
      ),
      retry: "Retry",
      retryIcon: RotateCcw,
    },
  };
  const c = copy[kind];
  return (
    <div role="alert" className="w-full max-w-sm rounded-card border border-alert/40 bg-alert-soft p-3 dark:border-alert-light/30 dark:bg-alert-soft-dark">
      <div className="flex items-center gap-2 font-semibold text-ink dark:text-paper">
        <Icon icon={c.icon} size={18} className="text-alert dark:text-alert-light" />
        {c.title}
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-ink dark:text-paper">{c.body}</p>
      <div className="mt-1 flex flex-wrap justify-end gap-1.5">
        <button type="button" onClick={onType} className={`${controlBase} min-h-11 flex-row gap-2 border-stone px-3 text-sm text-ink dark:border-stone-dark dark:text-paper`}>
          <Icon icon={Keyboard} size={18} />
          Type instead
        </button>
        <button type="button" onClick={onRetry} className={`${controlBase} min-h-11 flex-row gap-2 border-transparent bg-[#c93a29] px-3 text-sm text-white dark:bg-bloom-light dark:text-ink-bg`}>
          <Icon icon={c.retryIcon} size={18} />
          {c.retry}
        </button>
      </div>
    </div>
  );
}

export interface VoiceScreenProps {
  state: VoiceState;
  reply: string;
  toolLabel: string | null;
  cards: ToolResultEntry[];
  errorMessage: string | null;
  // The screen is being kept awake (wake lock held).
  awake: boolean;
  onPause: () => void;
  onResume: () => void;
  onInterrupt: () => void;
  onRetry: () => void;
  onType: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onSetLang: (lang: VoiceLang) => void;
}

export function VoiceScreen(p: VoiceScreenProps) {
  const { state } = p;
  const status = STATUS_LINE[state.status];
  const paused = state.status === "paused";
  const pauseMinutes = Math.round(PAUSE_TIMEOUT_MS / 60000);

  return (
    <div
      role="region"
      aria-label="Voice conversation"
      className="fixed inset-0 z-50 flex flex-col gap-3 bg-paper px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] dark:bg-ink-bg"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Voice language"
          className="inline-flex rounded-control border border-stone bg-paper-card p-0.5 dark:border-stone-dark dark:bg-ink-bg-card"
        >
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              lang={l.htmlLang}
              aria-pressed={state.lang === l.code}
              onClick={() => p.onSetLang(l.code)}
              className={`min-h-11 min-w-11 rounded-[10px] px-3 text-[13px] font-semibold ${
                state.lang === l.code ? "bg-bloom-soft text-ink dark:bg-bloom-soft-dark dark:text-paper" : "text-ink-muted dark:text-mist-muted"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        {p.awake && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-stone bg-paper-card px-2.5 py-1 text-xs font-semibold text-ink-muted dark:border-stone-dark dark:bg-ink-bg-card dark:text-mist-muted">
            <Icon icon={Sun} size={13} />
            Screen stays on
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto py-2 text-center">
        <Orb status={state.status} onTap={paused ? p.onResume : p.onPause} />

        {status && (
          <div role="status" className={`inline-flex items-center gap-2 font-display text-base font-semibold ${status.tone}`}>
            <Icon icon={status.icon} size={18} />
            {status.word}
          </div>
        )}

        {state.status === "error" && state.error ? (
          <ErrorPanel kind={state.error} message={p.errorMessage} onRetry={p.onRetry} onType={p.onType} />
        ) : (
          <div aria-live="polite" className="flex max-w-[30ch] flex-col items-center gap-2 sm:max-w-sm">
            {state.status === "speaking" ? (
              <p className="break-words font-display text-xl font-semibold leading-snug text-ink dark:text-paper">{p.reply}</p>
            ) : paused ? (
              <p className="font-display text-xl font-semibold leading-snug text-ink dark:text-paper">Not listening. Nothing is heard or sent.</p>
            ) : state.caption ? (
              <p className="break-words font-display text-xl font-semibold leading-snug text-ink dark:text-paper">{state.caption}</p>
            ) : (
              <p className="font-display text-xl font-semibold leading-snug text-ink-muted dark:text-mist-muted">Go ahead, I'm listening.</p>
            )}
            {state.status === "thinking" && p.toolLabel && (
              <span role="status" className="inline-flex items-center gap-2 rounded-full border border-stone bg-paper-card px-3 py-1 text-[13px] text-ink dark:border-stone-dark dark:bg-ink-bg-card dark:text-paper">
                <span className="h-1.5 w-1.5 rounded-full bg-bloom motion-safe:animate-pulse" aria-hidden="true" />
                {p.toolLabel}
              </span>
            )}
            {state.status === "listening" && (
              <>
                <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted dark:text-mist-muted">
                  <Icon icon={Clock} size={13} />
                  Pause when you're done and I'll reply
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted dark:text-mist-muted">
                  <Icon icon={MicOff} size={13} />
                  Tap the orb to pause the mic
                </span>
              </>
            )}
            {paused && (
              <>
                <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted dark:text-mist-muted">
                  <Icon icon={Clock} size={13} />
                  Voice ends by itself after {pauseMinutes} minutes paused
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted dark:text-mist-muted">
                  <Icon icon={Mic} size={13} />
                  Tap the orb to resume
                </span>
              </>
            )}
            {state.status === "speaking" && (
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted dark:text-mist-muted">
                <Icon icon={MicOff} size={13} />
                Mic is off while I speak
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-2">
        {p.cards.length > 0 && state.status !== "error" && (
          <AssistantToolCards
            entries={p.cards}
            failures={[]}
            quietNotes={[]}
            reply={null}
            canRetry={false}
            onRetry={() => {}}
            cap={2}
            onShowMore={p.onType}
            tapThrough={false}
          />
        )}
        {state.status === "thinking" && (
          <button type="button" onClick={p.onInterrupt} className={wideAction}>
            <Icon icon={Square} size={16} />
            Stop
          </button>
        )}
        {state.status === "speaking" && (
          <button type="button" onClick={p.onInterrupt} className={wideAction}>
            <Icon icon={Square} size={16} />
            Tap to interrupt
          </button>
        )}
        <div className="grid grid-cols-4 gap-1.5">
          {paused ? (
            <button type="button" onClick={p.onResume} className={controlFill}>
              <Icon icon={Mic} size={20} />
              Resume
            </button>
          ) : (
            <button type="button" onClick={p.onPause} disabled={state.status === "error"} className={controlPlain}>
              <Icon icon={MicOff} size={20} />
              Pause mic
            </button>
          )}
          <button type="button" onClick={p.onToggleMute} aria-pressed={state.muted} className={controlPlain}>
            <Icon icon={state.muted ? VolumeX : Volume2} size={20} />
            {state.muted ? "Muted" : "Mute"}
          </button>
          <button type="button" onClick={p.onType} className={controlPlain}>
            <Icon icon={Keyboard} size={20} />
            Type
          </button>
          <button type="button" onClick={p.onEnd} className={paused ? controlPlain : controlFill}>
            <Icon icon={X} size={20} />
            End
          </button>
        </div>
      </div>
    </div>
  );
}
