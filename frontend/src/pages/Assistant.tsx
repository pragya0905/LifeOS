import { useEffect, useRef, useState, type UIEvent } from "react";
import { useLocation, useOutletContext } from "react-router-dom";
import { useApi } from "../api/useApi";
import { useAssistantStream, type AssistantStreamEvent } from "../hooks/useAssistantStream";
import { useSpeechToText } from "../hooks/useSpeechToText";
import { useViewportHeight } from "../hooks/useViewportHeight";
import { describeToolUse } from "../lib/toolLabels";
import VoiceMode from "../components/VoiceMode";
import { useToast } from "../components/Toast";
import type { LayoutOutletContext } from "../components/Layout";
import { AssistantHeader } from "../components/assistant/AssistantHeader";
import { AssistantMessageList } from "../components/assistant/AssistantMessageList";
import { AssistantComposer } from "../components/assistant/AssistantComposer";
import { AssistantHistorySheet, type ConversationSummary } from "../components/assistant/AssistantHistorySheet";
import type { ChatMessage } from "../components/assistant/types";
import { errorText, primaryButton } from "../components/ui";

const CONVERSATION_ID_KEY = "lifeos_assistant_conversation_id";
const MUTED_KEY = "lifeos_assistant_muted";
const ALLOWED_ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const SCROLL_NEAR_BOTTOM_PX = 80;

interface PendingAttachment {
  key: string;
  contentType: string;
  fileName: string;
}

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

// The header has no toggle for this anymore (the approved Part 2 header is title + New +
// History, "nothing else") — Part 4 is where voice preferences get a real home in Settings.
// Until then this just preserves whatever a user previously set via the old toggle, read-only.
function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

const ONBOARDING_GREETING =
  "Nice, you're set up! Tell me a bit more about yourself — any routines, medications, or goals " +
  "you'd like me to know about? I'll turn whatever you tell me into the real thing in the app.";

interface AssistantProps {
  onboarding?: boolean;
  onFinish?: () => void;
}

export default function Assistant({ onboarding = false, onFinish }: AssistantProps) {
  const { request } = useApi();
  const { sendMessage: streamMessage } = useAssistantStream();
  const { show: showToast } = useToast();
  const location = useLocation();
  // Only present when rendered inside Layout's <Outlet> (the normal /assistant route) — the
  // onboarding flow renders this same component standalone, with no Layout ancestor at all,
  // so every use of this below is optional-chained.
  const outletContext = useOutletContext<LayoutOutletContext>() ?? null;

  const prefillText = (location.state as { prefillText?: string } | null)?.prefillText;
  const [messages, setMessages] = useState<ChatMessage[]>(
    onboarding ? [{ role: "assistant", content: ONBOARDING_GREETING }] : [],
  );
  const [text, setText] = useState(prefillText ?? "");
  const [sending, setSending] = useState(false);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [revealedTimestamp, setRevealedTimestamp] = useState<number | null>(null);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  // Mirrors what's reported up via outletContext.setComposerFocused — needed locally too,
  // since this page's own root height reserves space for the (mobile-only) bottom tab bar
  // only while it's actually visible, i.e. while the composer is NOT focused.
  const [composerFocused, setComposerFocusedState] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const conversationIdRef = useRef<string | undefined>(onboarding ? undefined : loadConversationId());
  const listEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wasNearBottomRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const viewportHeight = useViewportHeight();

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
    if (wasNearBottomRef.current) {
      listEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, sending]);

  // Cancel any in-flight stream on unmount (navigating away mid-reply) rather than letting it
  // keep writing into state after the component is gone.
  useEffect(() => () => abortControllerRef.current?.abort(), []);

  function handleScroll(e: UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distance < SCROLL_NEAR_BOTTOM_PX;
    wasNearBottomRef.current = nearBottom;
    setShowScrollToLatest(!nearBottom);
  }

  function scrollToLatest() {
    wasNearBottomRef.current = true;
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function startNewConversation() {
    window.speechSynthesis?.cancel();
    conversationIdRef.current = undefined;
    persistConversationId(undefined);
    setMessages([]);
    setError(null);
    setHistoryOpen(false);
    setRevealedTimestamp(null);
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
      setRevealedTimestamp(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reopen conversation");
    }
  }

  function handleConversationDeleted(conversationId: string) {
    setConversations((prev) => prev.filter((c) => c.conversationId !== conversationId));
    if (conversationIdRef.current === conversationId) startNewConversation();
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

  async function sendMessage(message: string, options?: { skipUserBubble?: boolean }) {
    if (listening) stopListening();
    const attachment = pendingAttachment;
    setPendingAttachment(null);
    if (!options?.skipUserBubble) {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: message, attachmentLabel: attachment?.fileName, createdAt: new Date().toISOString() },
      ]);
    }
    setSending(true);
    setStatusLabel(null);
    setError(null);
    wasNearBottomRef.current = true;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // No placeholder assistant bubble is pushed up front — the typing indicator covers that
    // gap instead, and the real bubble only appears once the first token (or the first
    // summarizable tool result) actually arrives. Mutated here, outside the setMessages
    // updater, for the same StrictMode-double-invoke reason as before: React dev-mode
    // double-invokes updater functions, and mutating this flag inside one flipped it early.
    let assistantMessageStarted = false;
    let pendingToolResults: NonNullable<ChatMessage["toolResults"]> = [];

    function appendToLastAssistantMessage(delta: string) {
      if (!assistantMessageStarted) {
        assistantMessageStarted = true;
        setStatusLabel(null);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: delta,
            createdAt: new Date().toISOString(),
            toolResults: pendingToolResults.length > 0 ? pendingToolResults : undefined,
          },
        ]);
      } else {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { ...next[next.length - 1], content: next[next.length - 1].content + delta };
          return next;
        });
      }
    }

    function appendToolResult(result: NonNullable<ChatMessage["toolResults"]>[number]) {
      if (!assistantMessageStarted) {
        pendingToolResults = [...pendingToolResults, result];
        return;
      }
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        next[next.length - 1] = { ...last, toolResults: [...(last.toolResults ?? []), result] };
        return next;
      });
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
            if (event.result) appendToolResult(event.result);
          } else if (event.type === "done") {
            conversationIdRef.current = event.conversationId;
            persistConversationId(event.conversationId);
          } else if (event.type === "error") {
            setError(event.message);
          }
        },
        onboarding ? "onboarding" : undefined,
        attachment ?? undefined,
        controller.signal,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // A user-initiated Stop — not a failure, nothing to show.
      } else {
        setError(err instanceof Error ? err.message : "Failed to reach the assistant");
      }
    } finally {
      setSending(false);
      setStatusLabel(null);
      abortControllerRef.current = null;
    }
  }

  function stopStreaming() {
    abortControllerRef.current?.abort();
  }

  async function triggerSend() {
    const trimmed = text.trim();
    if ((!trimmed && !pendingAttachment) || sending) return;
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

  async function copyMessage(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      showToast("Copied");
    } catch {
      setError("Couldn't copy — your browser blocked clipboard access");
    }
  }

  function retryLast() {
    if (sending) return;
    const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
    if (lastUserIndex === -1) return;
    const lastUserContent = messages[lastUserIndex].content;
    setMessages((prev) => prev.slice(0, lastUserIndex + 1));
    sendMessage(lastUserContent, { skipUserBubble: true });
  }

  async function handleExitVoiceMode() {
    setVoiceModeOpen(false);
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
        muted={loadMuted()}
        onClose={handleExitVoiceMode}
      />
    );
  }

  return (
    <div
      className={`fixed inset-x-0 top-0 z-20 flex flex-col bg-paper md:left-56 dark:bg-ink-bg ${
        // Reserves room for the (mobile-only) bottom tab bar, which Layout hides outright
        // while the composer is focused — so nothing needs reserving in that state, and
        // nothing is reserved at all at md+, where that tab bar never renders in the first
        // place (the sidebar replaces it).
        composerFocused ? "" : "pb-[calc(3rem+env(safe-area-inset-bottom))] md:pb-0"
      }`}
      style={{ height: viewportHeight }}
    >
      {onboarding ? (
        <div className="flex shrink-0 items-center justify-between border-b border-stone px-4 py-3 dark:border-stone-dark">
          <span className="font-display text-lg font-semibold text-ink dark:text-paper">Let's get to know you</span>
          <button type="button" onClick={onFinish} className={primaryButton}>
            Finish setup
          </button>
        </div>
      ) : (
        <AssistantHeader onNewChat={startNewConversation} onOpenHistory={openHistory} />
      )}

      <AssistantMessageList
        messages={messages}
        onboarding={onboarding}
        sending={sending}
        statusLabel={statusLabel}
        revealedTimestamp={revealedTimestamp}
        onToggleTimestamp={(i) => setRevealedTimestamp((prev) => (prev === i ? null : i))}
        onSuggestion={(s) => sendMessage(s)}
        onCopy={copyMessage}
        onRetry={retryLast}
        showScrollToLatest={showScrollToLatest}
        onScrollToLatest={scrollToLatest}
        onScroll={handleScroll}
        scrollContainerRef={scrollContainerRef}
        listEndRef={listEndRef}
      />

      {error && <p className={`shrink-0 px-4 py-1 ${errorText}`}>{error}</p>}
      {listening && <p className="shrink-0 px-4 py-1 text-xs text-alert">Listening…</p>}
      {voiceError && <p className={`shrink-0 px-4 py-1 text-xs ${errorText}`}>{voiceError}</p>}

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
      <AssistantComposer
        value={text}
        onChange={setText}
        onSubmit={triggerSend}
        sending={sending}
        onStop={stopStreaming}
        listening={listening}
        voiceSupported={voiceSupported}
        onToggleVoice={handleToggleVoice}
        attaching={attaching}
        pendingAttachment={pendingAttachment}
        onAttachClick={() => fileInputRef.current?.click()}
        onRemoveAttachment={() => setPendingAttachment(null)}
        onFocus={() => {
          setComposerFocusedState(true);
          outletContext?.setComposerFocused(true);
        }}
        onBlur={() => {
          setComposerFocusedState(false);
          outletContext?.setComposerFocused(false);
        }}
        textareaRef={textareaRef}
      />

      {!onboarding && (
        <AssistantHistorySheet
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          conversations={conversations}
          loading={historyLoading}
          onReopen={reopenConversation}
          onDeleted={handleConversationDeleted}
        />
      )}
    </div>
  );
}
