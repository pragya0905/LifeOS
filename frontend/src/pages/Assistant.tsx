import { useEffect, useRef, useState, type UIEvent } from "react";
import { useLocation, useOutletContext } from "react-router-dom";
import { useApi } from "../api/useApi";
import {
  AssistantRequestError,
  useAssistantStream,
  type AssistantAttachmentRef,
  type AssistantStreamEvent,
} from "../hooks/useAssistantStream";
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_TOTAL_ATTACHMENT_BYTES,
  formatMegabytes,
  usePendingAttachments,
} from "../hooks/usePendingAttachments";
import { useVoiceSession } from "../hooks/useVoiceSession";
import { useViewportHeight } from "../hooks/useViewportHeight";
import { describeToolUse } from "../lib/toolLabels";
import { useToast } from "../components/Toast";
import type { LayoutOutletContext } from "../components/Layout";
import { AssistantHeader } from "../components/assistant/AssistantHeader";
import { AssistantMessageList } from "../components/assistant/AssistantMessageList";
import { AssistantComposer } from "../components/assistant/AssistantComposer";
import { AssistantAttachmentTray } from "../components/assistant/AssistantAttachmentTray";
import { VoiceScreen } from "../components/assistant/VoiceScreen";
import { VoiceBanner } from "../components/assistant/VoiceBanner";
import { AssistantHistorySheet, type ConversationSummary } from "../components/assistant/AssistantHistorySheet";
import type { ChatMessage } from "../components/assistant/types";
import { openConversation } from "../lib/chatHistory";
import { ToolCallTracker, type ToolResultEntry, type StreamOutcome } from "../lib/toolCards";
import { isActive } from "../lib/voiceMachine";
import { errorText, primaryButton } from "../components/ui";

const CONVERSATION_ID_KEY = "lifeos_assistant_conversation_id";
const MUTED_KEY = "lifeos_assistant_muted";
const SCROLL_NEAR_BOTTOM_PX = 80;

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
  const [endDismissed, setEndDismissed] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // Opening a conversation from the sheet: the sheet stays open and shows the failure, with Retry.
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [openTargetId, setOpenTargetId] = useState<string | null>(null);
  const attachments = usePendingAttachments();
  const readyCount = attachments.items.filter((i) => i.status === "ready").length;
  const hasText = text.trim().length > 0;
  const hasContent = hasText || attachments.items.length > 0;
  // Text or at least one finished file, with no upload still in flight and the total under the cap.
  const canSend = !sending && !attachments.anyUploading && !attachments.overLimit && (hasText || readyCount > 0);
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

  const voice = useVoiceSession({
    getConversationId: () => conversationIdRef.current,
    onConversationId: (id) => {
      conversationIdRef.current = id;
      persistConversationId(id);
    },
    initialLang: "en-IN",
    initialMuted: loadMuted(),
  });
  const voiceStatus = voice.state.status;

  // Switching to typing puts the cursor in the composer straight away.
  useEffect(() => {
    if (voiceStatus === "typing") textareaRef.current?.focus();
  }, [voiceStatus]);

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
    voice.end();
    window.speechSynthesis?.cancel();
    conversationIdRef.current = undefined;
    persistConversationId(undefined);
    setMessages([]);
    setError(null);
    setHistoryOpen(false);
    setRevealedTimestamp(null);
  }

  async function openHistory() {
    setOpenError(null);
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
    setOpenTargetId(conversationId);
    setOpenError(null);
    setOpening(true);
    // cache: "no-store" so a Retry always asks the server, rather than replaying an answer
    // from a few seconds ago.
    const result = await openConversation(() =>
      request<{ turns: { role: "user" | "assistant"; content: string }[] }>(`/assistant/conversations/${conversationId}`, {
        cache: "no-store",
      }),
    );
    setOpening(false);
    if (!result.ok) {
      // Stays open: the sheet says what happened and offers Retry, rather than closing silently.
      setOpenError(result.reason);
      return;
    }
    voice.end();
    conversationIdRef.current = conversationId;
    persistConversationId(conversationId);
    setMessages(result.messages);
    setHistoryOpen(false);
    setError(null);
    setRevealedTimestamp(null);
  }

  function handleConversationDeleted(conversationId: string) {
    setConversations((prev) => prev.filter((c) => c.conversationId !== conversationId));
    if (conversationIdRef.current === conversationId) startNewConversation();
  }

  function handleFilesSelected(files: File[]) {
    const notices = attachments.addFiles(files);
    setError(notices.length > 0 ? notices.join(". ") : null);
  }

  async function sendMessage(
    message: string,
    options?: { skipUserBubble?: boolean; fromComposer?: boolean; retryAttachments?: AssistantAttachmentRef[] },
  ) {
    const retrying = options?.retryAttachments !== undefined;
    if (!retrying && (attachments.anyUploading || attachments.overLimit)) {
      setError(
        attachments.anyUploading
          ? "Wait for your files to finish uploading, then send"
          : `These files total more than ${formatMegabytes(MAX_TOTAL_ATTACHMENT_BYTES)} — remove one to send`,
      );
      return;
    }
    // Ready files leave the tray for this send. They go back in if the send fails before any reply.
    const taken = retrying ? [] : attachments.takeReady();
    const refs: AssistantAttachmentRef[] = retrying ? (options?.retryAttachments ?? []) : taken.map((t) => t.ref!);
    const notSent = retrying ? 0 : attachments.items.filter((i) => i.status === "error").length;
    if (notSent > 0) showToast(`${notSent} file${notSent === 1 ? "" : "s"} didn't upload and wasn't sent`);

    const userMessage: ChatMessage = {
      role: "user",
      content: message,
      attachments: refs.length > 0 ? refs : undefined,
      attachmentNames: refs.length > 0 ? refs.map((r) => r.fileName) : undefined,
      createdAt: new Date().toISOString(),
    };
    if (!options?.skipUserBubble) {
      setMessages((prev) => [...prev, userMessage]);
    }
    setSending(true);
    setStatusLabel(null);
    setError(null);
    wasNearBottomRef.current = true;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Until the first text or tool event arrives, a failure rolls the send back: the bubble comes
    // off, the files go back in the tray, and the text returns to the composer — nothing typed or
    // attached is lost. Once the reply has started, a failure is just shown.
    let replyStarted = false;
    function rollBack(reason: string) {
      if (!options?.skipUserBubble) setMessages((prev) => prev.filter((m) => m !== userMessage));
      if (taken.length > 0) attachments.restore(taken);
      if (options?.fromComposer) setText((prev) => (prev.trim() ? `${message}\n${prev}` : message));
      setError(reason);
    }

    // No placeholder assistant bubble is pushed up front — the typing indicator covers that
    // gap instead, and the real bubble only appears once the first token (or the first
    // summarizable tool result) actually arrives. Mutated here, outside the setMessages
    // updater, for the same StrictMode-double-invoke reason as before: React dev-mode
    // double-invokes updater functions, and mutating this flag inside one flipped it early.
    let assistantMessageStarted = false;
    let pendingToolResults: ToolResultEntry[] = [];
    const tracker = new ToolCallTracker();
    let resultCount = 0;
    let sawDone = false;
    let errorMessage: string | undefined;

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

    function appendToolResult(entry: ToolResultEntry) {
      resultCount += 1;
      if (!assistantMessageStarted) {
        pendingToolResults = [...pendingToolResults, entry];
        return;
      }
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        next[next.length - 1] = { ...last, toolResults: [...(last.toolResults ?? []), entry] };
        return next;
      });
    }

    // Once the stream is over, any tool that started and never returned a result becomes a
    // failure card, and reads/deletes become quiet notes. If the reply never produced a message
    // (no text), one is created to hold them.
    function settleToolCalls(outcome: StreamOutcome) {
      const toolFailures = tracker.finish(outcome, errorMessage, resultCount);
      const quietNotes = tracker.quiet;
      if (toolFailures.length === 0 && quietNotes.length === 0) return;
      const patch = {
        toolFailures: toolFailures.length > 0 ? toolFailures : undefined,
        quietNotes: quietNotes.length > 0 ? [...quietNotes] : undefined,
      };
      if (assistantMessageStarted) {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { ...next[next.length - 1], ...patch };
          return next;
        });
      } else {
        assistantMessageStarted = true;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "",
            createdAt: new Date().toISOString(),
            toolResults: pendingToolResults.length > 0 ? pendingToolResults : undefined,
            ...patch,
          },
        ]);
      }
    }

    try {
      await streamMessage(
        message,
        conversationIdRef.current,
        (event: AssistantStreamEvent) => {
          if (event.type === "text") {
            replyStarted = true;
            appendToLastAssistantMessage(event.delta);
          } else if (event.type === "tool_use" || event.type === "tool_error") {
            replyStarted = true;
            if (event.type === "tool_use") setStatusLabel(describeToolUse(event.name));
            const card = tracker.handle(event);
            if (card) appendToolResult(card);
          } else if (event.type === "done") {
            replyStarted = true;
            sawDone = true;
            conversationIdRef.current = event.conversationId;
            persistConversationId(event.conversationId);
          } else if (event.type === "error") {
            // With a tool still running, the failure card carries this message instead of a
            // separate red line.
            if (tracker.hasPending()) errorMessage = event.message;
            else if (replyStarted) setError(event.message);
            else rollBack(event.message);
          }
        },
        onboarding ? "onboarding" : undefined,
        refs,
        controller.signal,
      );
      // The stream closed cleanly: finished, ended on an error event, or just stopped with no
      // "done" (a timeout looks like this).
      settleToolCalls(sawDone ? "done" : errorMessage !== undefined ? "error" : "ended");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // A user-initiated Stop — not a failure, nothing to show.
      } else if (replyStarted && tracker.hasPending()) {
        settleToolCalls("ended");
      } else if (!replyStarted) {
        rollBack(
          err instanceof AssistantRequestError
            ? err.message
            : "Couldn't reach the assistant — your message and files are still here",
        );
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
    if (!canSend) return;
    const trimmed = text.trim();
    setText("");
    await sendMessage(trimmed, { fromComposer: true });
  }

  function openVoice() {
    setEndDismissed(false);
    voice.open();
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
    const last = messages[lastUserIndex];
    // A turn reloaded from history has file names but no upload references, so its files can't be resent.
    if (last.attachmentNames && last.attachmentNames.length > 0 && !last.attachments) {
      setError("These files were sent in an earlier session — attach them again to resend");
      return;
    }
    setMessages((prev) => prev.slice(0, lastUserIndex + 1));
    sendMessage(last.content, { skipUserBubble: true, retryAttachments: last.attachments ?? [] });
  }

  return (
    <>
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
      {voiceStatus === "typing" && (
        <VoiceBanner mode="typing" endReason={null} onResume={voice.resume} onStartAgain={openVoice} onDismiss={() => {}} />
      )}
      {voiceStatus === "ended" && voice.state.endReason !== "user" && !endDismissed && (
        <VoiceBanner mode="ended" endReason={voice.state.endReason} onResume={voice.resume} onStartAgain={openVoice} onDismiss={() => setEndDismissed(true)} />
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ALLOWED_ATTACHMENT_TYPES.join(",")}
        onChange={(e) => {
          // Read every picked file, then clear the input so picking the same file again still fires onChange.
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length > 0) handleFilesSelected(files);
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
        voiceSupported={voice.supported && !onboarding}
        onOpenVoice={openVoice}
        attachmentTray={
          <AssistantAttachmentTray
            items={attachments.items}
            totalBytes={attachments.totalBytes}
            overLimit={attachments.overLimit}
            onRetry={attachments.retry}
            onRetryFailed={attachments.retryFailed}
            onRemove={attachments.remove}
          />
        }
        hasContent={hasContent}
        canSend={canSend}
        onAttachClick={() => fileInputRef.current?.click()}
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
          opening={opening}
          openError={openError}
          onRetryOpen={() => {
            if (openTargetId) reopenConversation(openTargetId);
          }}
          onDeleted={handleConversationDeleted}
        />
      )}
    </div>

    {isActive(voiceStatus) && (
      <VoiceScreen
        state={voice.state}
        reply={voice.reply}
        toolLabel={voice.toolLabel}
        cards={voice.cards}
        errorMessage={voice.errorMessage}
        awake={false}
        onPause={voice.pause}
        onResume={voice.resume}
        onInterrupt={voice.interrupt}
        onRetry={voice.retry}
        onType={voice.typeInstead}
        onEnd={voice.end}
        onToggleMute={voice.toggleMute}
        onSetLang={voice.setLang}
      />
    )}
    </>
  );
}
