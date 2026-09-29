import { useRef, useState } from "react";
import { useAssistantStream, type AssistantStreamEvent } from "../hooks/useAssistantStream";
import { useSpeechToText } from "../hooks/useSpeechToText";
import { errorText, mutedText } from "./ui";

type VoiceState = "idle" | "listening" | "thinking" | "speaking";

interface VoiceModeProps {
  conversationId: string | undefined;
  onConversationId: (id: string) => void;
  muted: boolean;
  onClose: () => void;
}

const STATE_LABEL: Record<VoiceState, string> = {
  idle: "Tap to start talking",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

const STATE_COLOR: Record<VoiceState, string> = {
  idle: "bg-stone dark:bg-stone-dark",
  listening: "bg-bloom",
  thinking: "bg-mist-muted",
  speaking: "bg-bloom-light",
};

// A dedicated hands-free mode: listen → send → speak → listen again, automatically, without a
// tap between turns — the existing inline mic in the text chat still requires pressing Send
// (or waiting for auto-send) once per utterance, this loops continuously until closed.
export default function VoiceMode({ conversationId, onConversationId, muted, onClose }: VoiceModeProps) {
  const { sendMessage } = useAssistantStream();
  const [state, setState] = useState<VoiceState>("idle");
  const [lastHeard, setLastHeard] = useState("");
  const [lastReply, setLastReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const conversationIdRef = useRef(conversationId);

  const { supported, error: voiceError, start, stop } = useSpeechToText((transcript, isFinal) => {
    setLastHeard(transcript);
    if (isFinal && transcript.trim()) {
      stop();
      handleTurn(transcript.trim());
    }
  });

  async function handleTurn(message: string) {
    setState("thinking");
    setError(null);
    let fullReply = "";
    try {
      await sendMessage(message, conversationIdRef.current, (event: AssistantStreamEvent) => {
        if (event.type === "text") {
          fullReply += event.delta;
        } else if (event.type === "done") {
          conversationIdRef.current = event.conversationId;
          onConversationId(event.conversationId);
        } else if (event.type === "error") {
          setError(event.message);
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reach the assistant");
      setState("idle");
      return;
    }

    setLastReply(fullReply);

    // TTS needs a complete utterance, not token fragments — the whole "thinking" state above
    // covers the stream's duration, so speaking only starts once the full reply is in hand.
    if (muted || !fullReply || typeof window === "undefined" || !window.speechSynthesis) {
      startListeningLoop();
      return;
    }
    setState("speaking");
    const utterance = new SpeechSynthesisUtterance(fullReply);
    utterance.onend = () => startListeningLoop();
    utterance.onerror = () => startListeningLoop();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function startListeningLoop() {
    setLastHeard("");
    setState("listening");
    start();
  }

  function handleOrbTap() {
    if (state === "idle") {
      startListeningLoop();
    } else if (state === "listening") {
      stop();
      setState("idle");
    }
  }

  function handleClose() {
    stop();
    window.speechSynthesis?.cancel();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-paper p-6 dark:bg-ink-bg">
      <div className="flex w-full justify-end">
        <button
          type="button"
          onClick={handleClose}
          aria-label="Exit voice mode"
          className="rounded-full p-2 text-ink-muted transition-colors hover:bg-stone/40 dark:text-mist-muted dark:hover:bg-stone-dark/40"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <button
          type="button"
          onClick={handleOrbTap}
          disabled={state === "thinking" || state === "speaking"}
          aria-label={STATE_LABEL[state]}
          className={`h-40 w-40 rounded-full transition-all duration-300 disabled:cursor-default ${
            state === "listening" ? "animate-pulse" : ""
          } ${STATE_COLOR[state]}`}
        />
        <p className="text-sm font-medium text-ink dark:text-paper">{STATE_LABEL[state]}</p>
        {lastHeard && state === "listening" && (
          <p className={`max-w-xs text-center text-sm ${mutedText}`}>"{lastHeard}"</p>
        )}
        {lastReply && (state === "speaking" || state === "idle") && (
          <p className="max-w-sm text-center text-sm text-ink dark:text-paper">{lastReply}</p>
        )}
        {!supported && <p className={`text-sm ${errorText}`}>Voice input isn't supported in this browser.</p>}
        {voiceError && <p className={`text-sm ${errorText}`}>{voiceError}</p>}
        {error && <p className={`text-sm ${errorText}`}>{error}</p>}
      </div>

      <p className={`mb-2 ${mutedText}`}>Tap the circle to talk. Tap ✕ to exit.</p>
    </div>
  );
}
