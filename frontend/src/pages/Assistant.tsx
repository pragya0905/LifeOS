import { useEffect, useRef, useState, type FormEvent } from "react";
import { useApi } from "../api/useApi";
import { useSpeechToText } from "../hooks/useSpeechToText";
import {
  card,
  errorText,
  input,
  mutedText,
  page,
  pageTitle,
  pillButton,
  pillButtonInactive,
  primaryButton,
  secondaryButton,
} from "../components/ui";

const CONVERSATION_ID_KEY = "lifeos_assistant_conversation_id";
const MUTED_KEY = "lifeos_assistant_muted";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatResponse {
  conversationId: string;
  reply: string;
}

function loadConversationId(): string | undefined {
  try {
    return localStorage.getItem(CONVERSATION_ID_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

export default function Assistant() {
  const { request } = useApi();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(loadMuted);
  const conversationIdRef = useRef<string | undefined>(loadConversationId());
  const listEndRef = useRef<HTMLDivElement>(null);

  const {
    supported: voiceSupported,
    listening,
    error: voiceError,
    start: startListening,
    stop: stopListening,
  } = useSpeechToText((transcript, isFinal) => {
    setText(transcript);
    // Speaking a full utterance and pausing sends it immediately, matching the "talk to it"
    // ask — typing still requires pressing Send, since interim/incomplete text shouldn't fire.
    if (isFinal && transcript.trim()) {
      sendMessage(transcript.trim());
      setText("");
    }
  });

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  function speak(text: string) {
    if (muted || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }

  function toggleMuted() {
    setMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MUTED_KEY, next ? "1" : "0");
      } catch {
        // Best-effort — mute preference just won't persist across reloads.
      }
      if (next) window.speechSynthesis?.cancel();
      return next;
    });
  }

  function startNewConversation() {
    window.speechSynthesis?.cancel();
    conversationIdRef.current = undefined;
    try {
      localStorage.removeItem(CONVERSATION_ID_KEY);
    } catch {
      // Best-effort.
    }
    setMessages([]);
    setError(null);
  }

  async function sendMessage(message: string) {
    if (listening) stopListening();
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setSending(true);
    setError(null);
    try {
      const data = await request<ChatResponse>("/assistant/chat", {
        method: "POST",
        body: JSON.stringify({ message, conversationId: conversationIdRef.current }),
      });
      conversationIdRef.current = data.conversationId;
      try {
        localStorage.setItem(CONVERSATION_ID_KEY, data.conversationId);
      } catch {
        // Best-effort.
      }
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      speak(data.reply);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reach the assistant");
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setText("");
    await sendMessage(trimmed);
  }

  function handleToggleVoice() {
    if (listening) {
      stopListening();
      return;
    }
    setText("");
    startListening();
  }

  return (
    <div className={page}>
      <div className="mb-6 flex items-center justify-between">
        <h1 className={`${pageTitle} mb-0`}>Assistant</h1>
        <div className="flex gap-2">
          <button type="button" onClick={toggleMuted} className={secondaryButton}>
            {muted ? "🔇 Unmute replies" : "🔊 Mute replies"}
          </button>
          <button type="button" onClick={startNewConversation} className={secondaryButton}>
            New conversation
          </button>
        </div>
      </div>

      <div className={`mb-4 flex min-h-[50vh] flex-col gap-3 ${card}`}>
        {messages.length === 0 ? (
          <p className={mutedText}>
            Talk or type — log a habit, ask what's on your schedule, add a task, or just check in.
            I'll remember this conversation as we go.
          </p>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <p
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-bloom text-paper-card"
                    : "bg-stone/40 text-ink dark:bg-stone-dark/40 dark:text-paper"
                }`}
              >
                {m.content}
              </p>
            </div>
          ))
        )}
        {sending && <p className={mutedText}>Thinking…</p>}
        <div ref={listEndRef} />
      </div>

      {error && <p className={`mb-4 ${errorText}`}>{error}</p>}

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type or use the mic..."
          className={`flex-1 ${input}`}
        />
        {voiceSupported && (
          <button
            type="button"
            onClick={handleToggleVoice}
            className={`${pillButton} px-3 py-2 ${
              listening ? "border-alert bg-alert text-paper-card" : pillButtonInactive
            }`}
          >
            {listening ? "Stop" : "🎤"}
          </button>
        )}
        <button type="submit" disabled={sending || !text.trim()} className={primaryButton}>
          Send
        </button>
      </form>
      {listening && <p className="mt-1 text-xs text-alert">Listening…</p>}
      {voiceError && <p className={`mt-1 text-xs ${errorText}`}>{voiceError}</p>}
    </div>
  );
}
