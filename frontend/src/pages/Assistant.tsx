import { useEffect, useRef, useState, type FormEvent } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useApi } from "../api/useApi";
import { useAssistantStream, type AssistantStreamEvent } from "../hooks/useAssistantStream";
import { useSpeechToText } from "../hooks/useSpeechToText";
import { describeToolUse } from "../lib/toolLabels";
import VoiceMode from "../components/VoiceMode";
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
const ALLOWED_ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_TEXTAREA_HEIGHT = 160; // ~6-7 lines at text-sm before the composer scrolls internally

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  attachmentLabel?: string;
}

interface PendingAttachment {
  key: string;
  contentType: string;
  fileName: string;
}

interface ConversationSummary {
  conversationId: string;
  preview: string;
  lastMessageAt: string;
}

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="mb-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  code: ({ children }) => (
    <code className="rounded bg-black/10 px-1 py-0.5 text-xs dark:bg-white/10">{children}</code>
  ),
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline">
      {children}
    </a>
  ),
};

function loadConversationId(): string | undefined {
  try {
    return localStorage.getItem(CONVERSATION_ID_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function persistConversationId(id: string | undefined) {
  try {
    if (id) localStorage.setItem(CONVERSATION_ID_KEY, id);
    else localStorage.removeItem(CONVERSATION_ID_KEY);
  } catch {
    // Best-effort — just won't persist across reloads.
  }
}

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const ONBOARDING_GREETING =
  "Nice, you're set up! Tell me a bit more about yourself — any routines, medications, or goals " +
  "you'd like me to know about? I'll turn whatever you tell me into the real thing in the app.";

const SUGGESTED_MESSAGES = [
  "Let's log today",
  "What's on my schedule today?",
  "How's my budget looking?",
];

interface AssistantProps {
  onboarding?: boolean;
  onFinish?: () => void;
}

export default function Assistant({ onboarding = false, onFinish }: AssistantProps) {
  const { request } = useApi();
  const { sendMessage: streamMessage } = useAssistantStream();
  const [messages, setMessages] = useState<ChatMessage[]>(
    onboarding ? [{ role: "assistant", content: ONBOARDING_GREETING }] : [],
  );
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(loadMuted);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [attaching, setAttaching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Onboarding always starts a brand-new conversation rather than picking up whatever
  // conversationId happens to be in localStorage from a prior session.
  const conversationIdRef = useRef<string | undefined>(onboarding ? undefined : loadConversationId());
  const listEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    supported: voiceSupported,
    listening,
    error: voiceError,
    start: startListening,
    stop: stopListening,
  } = useSpeechToText((transcript, isFinal) => {
    setText(transcript);
    if (isFinal && transcript.trim()) {
      sendMessage(transcript.trim());
      setText("");
    }
  });

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // Auto-grows the composer up to MAX_TEXTAREA_HEIGHT as multi-line content is typed or
  // pasted in, then scrolls internally past that — a plain <input> can't hold newlines at
  // all, which was silently flattening any pasted multi-line text into one line.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [text]);

  function toggleMuted() {
    setMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MUTED_KEY, next ? "1" : "0");
      } catch {
        // Best-effort.
      }
      if (next) window.speechSynthesis?.cancel();
      return next;
    });
  }

  function startNewConversation() {
    window.speechSynthesis?.cancel();
    conversationIdRef.current = undefined;
    persistConversationId(undefined);
    setMessages([]);
    setError(null);
    setHistoryOpen(false);
  }

  async function openHistory() {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const data = await request<{ conversations: ConversationSummary[] }>("/assistant/conversations");
      setConversations(data.conversations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversation history");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function reopenConversation(conversationId: string) {
    try {
      const data = await request<{ turns: { role: "user" | "assistant"; content: string }[] }>(
        `/assistant/conversations/${conversationId}`,
      );
      conversationIdRef.current = conversationId;
      persistConversationId(conversationId);
      setMessages(data.turns.map((t) => ({ role: t.role, content: t.content })));
      setHistoryOpen(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reopen conversation");
    }
  }

  async function deleteConversation(conversationId: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await request(`/assistant/conversations/${conversationId}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.conversationId !== conversationId));
      if (conversationIdRef.current === conversationId) startNewConversation();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete conversation");
    }
  }

  async function handleFileSelected(file: File) {
    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
      setError("Only JPEG, PNG, WEBP, GIF images or PDFs are supported");
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError("That file is too large (max 15MB)");
      return;
    }
    setAttaching(true);
    setError(null);
    try {
      const { uploadUrl, key } = await request<{ uploadUrl: string; key: string }>(
        "/assistant/attachments/presign",
        { method: "POST", body: JSON.stringify({ contentType: file.type }) },
      );
      const putResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putResponse.ok) throw new Error("Upload to storage failed");
      setPendingAttachment({ key, contentType: file.type, fileName: file.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to attach file");
    } finally {
      setAttaching(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function sendMessage(message: string) {
    if (listening) stopListening();
    const attachment = pendingAttachment;
    setPendingAttachment(null);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: message, attachmentLabel: attachment?.fileName },
    ]);
    setSending(true);
    setStatusLabel(null);
    setError(null);

    // No placeholder assistant bubble is pushed up front — the typing indicator covers that
    // gap instead, and the real bubble only appears once the first token actually arrives.
    // The "started yet" flag is mutated here, outside the setMessages updater — React's dev
    // StrictMode double-invokes updater functions to catch impure ones, and mutating this flag
    // inside the updater itself caused exactly that: the throwaway first invocation flipped it
    // to true, so the real second invocation appended the reply onto the user's own bubble
    // instead of starting a new one.
    let assistantMessageStarted = false;
    function appendToLastAssistantMessage(delta: string) {
      if (!assistantMessageStarted) {
        assistantMessageStarted = true;
        setStatusLabel(null);
        setMessages((prev) => [...prev, { role: "assistant", content: delta }]);
      } else {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { ...next[next.length - 1], content: next[next.length - 1].content + delta };
          return next;
        });
      }
    }

    try {
      await streamMessage(
        message,
        conversationIdRef.current,
        (event: AssistantStreamEvent) => {
          if (event.type === "text") {
            appendToLastAssistantMessage(event.delta);
          } else if (event.type === "tool_use") {
            setStatusLabel(describeToolUse(event.name));
          } else if (event.type === "done") {
            conversationIdRef.current = event.conversationId;
            persistConversationId(event.conversationId);
          } else if (event.type === "error") {
            setError(event.message);
          }
        },
        onboarding ? "onboarding" : undefined,
        attachment ?? undefined,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reach the assistant");
    } finally {
      setSending(false);
      setStatusLabel(null);
    }
  }

  async function triggerSend() {
    const trimmed = text.trim();
    if ((!trimmed && !pendingAttachment) || sending) return;
    setText("");
    await sendMessage(trimmed);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    triggerSend();
  }

  function handleToggleVoice() {
    if (listening) {
      stopListening();
      return;
    }
    setText("");
    startListening();
  }

  async function handleExitVoiceMode() {
    setVoiceModeOpen(false);
    // Voice mode sends messages independently of this page's own state — resync from the
    // database so the text view reflects whatever was said while it was open.
    if (conversationIdRef.current) {
      try {
        const data = await request<{ turns: { role: "user" | "assistant"; content: string }[] }>(
          `/assistant/conversations/${conversationIdRef.current}`,
        );
        setMessages(data.turns.map((t) => ({ role: t.role, content: t.content })));
      } catch {
        // Best-effort resync — the existing text-mode messages just stay as they were.
      }
    }
  }

  if (voiceModeOpen) {
    return (
      <VoiceMode
        conversationId={conversationIdRef.current}
        onConversationId={(id) => {
          conversationIdRef.current = id;
          persistConversationId(id);
        }}
        muted={muted}
        onClose={handleExitVoiceMode}
      />
    );
  }

  const lastMessage = messages[messages.length - 1];
  const awaitingFirstToken = sending && (!lastMessage || lastMessage.role === "user");

  return (
    <div className={page}>
      <div className="mb-6 flex items-center justify-between">
        <h1 className={`${pageTitle} mb-0`}>{onboarding ? "Let's get to know you" : "Assistant"}</h1>
        <div className="flex gap-2">
          {onboarding ? (
            <button type="button" onClick={onFinish} className={primaryButton}>
              Finish setup
            </button>
          ) : (
            <>
              <button type="button" onClick={openHistory} className={secondaryButton} aria-label="Conversation history">
                🗂️
              </button>
              <button type="button" onClick={toggleMuted} className={secondaryButton}>
                {muted ? "🔇" : "🔊"}
              </button>
              <button type="button" onClick={startNewConversation} className={secondaryButton}>
                New
              </button>
            </>
          )}
        </div>
      </div>

      <div className={`mb-4 flex min-h-[50vh] flex-col gap-3 ${card}`}>
        {messages.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className={mutedText}>
              Talk or type — log a habit, ask what's on your schedule, add a task, or just check in.
              I'll remember this conversation as we go.
            </p>
            {!onboarding && (
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_MESSAGES.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => sendMessage(suggestion)}
                    className={`${pillButton} ${pillButtonInactive} px-3 py-1.5`}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`animate-fade-in-up flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                  m.role === "user"
                    ? "whitespace-pre-wrap bg-bloom text-paper-card"
                    : "bg-stone/40 text-ink dark:bg-stone-dark/40 dark:text-paper"
                }`}
              >
                {m.attachmentLabel && (
                  <div className="mb-1 text-xs opacity-80">📎 {m.attachmentLabel}</div>
                )}
                {m.role === "assistant" ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {m.content}
                  </ReactMarkdown>
                ) : (
                  m.content
                )}
              </div>
            </div>
          ))
        )}
        {awaitingFirstToken && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl bg-stone/40 px-4 py-3 dark:bg-stone-dark/40">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted [animation-delay:-0.3s] dark:bg-mist-muted" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted [animation-delay:-0.15s] dark:bg-mist-muted" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted dark:bg-mist-muted" />
              </div>
              {statusLabel && <span className={mutedText}>{statusLabel}</span>}
            </div>
          </div>
        )}
        <div ref={listEndRef} />
      </div>

      {error && <p className={`mb-4 ${errorText}`}>{error}</p>}

      {pendingAttachment && (
        <div className="mb-2 flex items-center gap-2 text-xs text-ink-muted dark:text-mist-muted">
          <span>📎 {pendingAttachment.fileName}</span>
          <button
            type="button"
            onClick={() => setPendingAttachment(null)}
            aria-label="Remove attachment"
            className="text-alert hover:underline"
          >
            ✕
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_ATTACHMENT_TYPES.join(",")}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelected(file);
          }}
          className="hidden"
          id="assistant-attachment-input"
        />
        <label
          htmlFor="assistant-attachment-input"
          aria-label="Attach a photo or document"
          className={`${pillButton} ${pillButtonInactive} cursor-pointer px-3 py-2 ${attaching ? "opacity-50" : ""}`}
        >
          {attaching ? "…" : "📎"}
        </label>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              triggerSend();
            }
          }}
          placeholder="Type or use the mic... (Shift+Enter for a new line)"
          rows={1}
          className={`flex-1 resize-none overflow-y-auto ${input}`}
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
        {voiceSupported && (
          <button
            type="button"
            onClick={() => setVoiceModeOpen(true)}
            className={`${pillButton} ${pillButtonInactive} px-3 py-2`}
            aria-label="Voice mode"
          >
            🎙️
          </button>
        )}
        <button
          type="submit"
          disabled={sending || (!text.trim() && !pendingAttachment)}
          className={secondaryButton}
        >
          Send
        </button>
      </form>
      {listening && <p className="mt-1 text-xs text-alert">Listening…</p>}
      {voiceError && <p className={`mt-1 text-xs ${errorText}`}>{voiceError}</p>}

      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button
            type="button"
            aria-label="Close history"
            onClick={() => setHistoryOpen(false)}
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm dark:bg-ink-bg/70"
          />
          <div className="animate-fade-in-up relative w-full max-w-2xl rounded-t-3xl border border-b-0 border-stone bg-paper-card p-5 pb-8 dark:border-stone-dark dark:bg-ink-bg-card">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-stone dark:bg-stone-dark" />
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium text-ink dark:text-paper">Conversations</span>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-stone/40 dark:text-mist-muted dark:hover:bg-stone-dark/40"
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {historyLoading ? (
              <p className={mutedText}>Loading…</p>
            ) : conversations.length === 0 ? (
              <p className={mutedText}>No past conversations yet.</p>
            ) : (
              <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
                {conversations.map((c) => (
                  <li
                    key={c.conversationId}
                    role="button"
                    tabIndex={0}
                    onClick={() => reopenConversation(c.conversationId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") reopenConversation(c.conversationId);
                    }}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-stone px-3.5 py-2.5 text-left transition-colors hover:bg-stone/40 dark:border-stone-dark dark:hover:bg-stone-dark/40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink dark:text-paper">{c.preview}</span>
                      <span className="block text-xs text-ink-muted dark:text-mist-muted">
                        {relativeTime(c.lastMessageAt)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={(e) => deleteConversation(c.conversationId, e)}
                      className="shrink-0 text-xs text-alert hover:underline"
                    >
                      🗑️
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
