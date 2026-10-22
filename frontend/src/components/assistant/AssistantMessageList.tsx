import { type RefObject, type UIEvent } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowDown, Copy, Paperclip, RotateCcw, Sparkles } from "lucide-react";
import { Icon } from "../Icon";
import { IconButton } from "../IconButton";
import { AssistantToolResultCard } from "./AssistantToolResultCard";
import type { ChatMessage } from "./types";

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="mb-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-bloom underline dark:text-bloom-light">
      {children}
    </a>
  ),
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-control border border-stone bg-stone/20 p-3 last:mb-0 dark:border-stone-dark dark:bg-stone-dark/20">
      {children}
    </pre>
  ),
  code: ({ className, children }) =>
    className ? (
      <code className="font-mono text-[0.8em] leading-relaxed">{children}</code>
    ) : (
      <code className="rounded bg-black/10 px-1 py-0.5 text-[0.85em] dark:bg-white/10">{children}</code>
    ),
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-stone dark:border-stone-dark">{children}</thead>,
  tr: ({ children }) => <tr className="border-b border-stone/50 last:border-0 dark:border-stone-dark/50">{children}</tr>,
  th: ({ children }) => <th className="px-2 py-1 text-left font-medium">{children}</th>,
  td: ({ children }) => <td className="px-2 py-1 align-top">{children}</td>,
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const SUGGESTIONS = [
  "Let's log today",
  "What's on my schedule today?",
  "How's my budget looking?",
  "Plan my day",
];

export function AssistantMessageList({
  messages,
  onboarding,
  sending,
  statusLabel,
  revealedTimestamp,
  onToggleTimestamp,
  onSuggestion,
  onCopy,
  onRetry,
  showScrollToLatest,
  onScrollToLatest,
  onScroll,
  scrollContainerRef,
  listEndRef,
}: {
  messages: ChatMessage[];
  onboarding: boolean;
  sending: boolean;
  statusLabel: string | null;
  revealedTimestamp: number | null;
  onToggleTimestamp: (index: number) => void;
  onSuggestion: (text: string) => void;
  onCopy: (content: string) => void;
  onRetry: () => void;
  showScrollToLatest: boolean;
  onScrollToLatest: () => void;
  onScroll: (e: UIEvent<HTMLDivElement>) => void;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  listEndRef: RefObject<HTMLDivElement | null>;
}) {
  const lastMessage = messages[messages.length - 1];
  const awaitingFirstToken = sending && (!lastMessage || lastMessage.role === "user");
  const lastAssistantIndex = messages.map((m) => m.role).lastIndexOf("assistant");

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollContainerRef} onScroll={onScroll} className="h-full overflow-y-auto px-4 pb-2 pt-3">
        {messages.length === 0 ? (
          <div className="mx-auto flex min-h-full max-w-[720px] flex-col justify-end gap-5 pb-2">
            <div className="flex flex-col gap-1.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-bloom text-paper-card">
                <Icon icon={Sparkles} size={14} />
              </div>
              <h2 className="font-display text-xl font-semibold text-ink dark:text-paper">What's on your mind?</h2>
              <p className="max-w-[30ch] text-sm text-ink-muted dark:text-mist-muted">
                Talk or type — log something, ask what's going on, or just check in.
              </p>
            </div>
            {!onboarding && (
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSuggestion(s)}
                    className="inline-flex min-h-9 items-center rounded-full border border-stone px-3.5 py-1.5 text-xs font-medium text-ink transition-colors hover:border-bloom hover:text-bloom dark:border-stone-dark dark:text-paper dark:hover:text-bloom-light"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto flex max-w-[720px] flex-col gap-4">
            {messages.map((m, i) => (
              <div key={i} className={`animate-fade-in-up flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "user" ? (
                  <button
                    type="button"
                    onClick={() => m.createdAt && onToggleTimestamp(i)}
                    className="max-w-[85%] rounded-2xl rounded-br-md bg-bloom px-3.5 py-2 text-left text-sm text-paper-card"
                  >
                    {m.attachmentNames && m.attachmentNames.length > 0 && (
                      <span className="mb-1 flex flex-col gap-0.5 text-xs opacity-90">
                        {m.attachmentNames.map((name, j) => (
                          <span key={j} className="inline-flex items-start gap-1 break-all">
                            <Icon icon={Paperclip} size={12} className="mt-0.5 shrink-0" />
                            {name}
                          </span>
                        ))}
                      </span>
                    )}
                    <span className="block whitespace-pre-wrap">{m.content}</span>
                    {m.createdAt && revealedTimestamp === i && (
                      <span className="mt-1 block text-[11px] opacity-75">{formatTimestamp(m.createdAt)}</span>
                    )}
                  </button>
                ) : (
                  <div className="flex max-w-full gap-2">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bloom-soft text-bloom dark:bg-bloom-soft-dark dark:text-bloom-light">
                      <Icon icon={Sparkles} size={12} />
                    </div>
                    <div className="min-w-0 flex-1 text-sm leading-[1.6] text-ink dark:text-paper">
                      <button
                        type="button"
                        onClick={() => m.createdAt && onToggleTimestamp(i)}
                        className="block w-full text-left"
                      >
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {m.content}
                        </ReactMarkdown>
                      </button>

                      {m.toolResults?.map((result, ri) => <AssistantToolResultCard key={ri} result={result} />)}

                      <div className="-ml-2.5 -my-1.5 flex items-center">
                        <IconButton icon={Copy} iconSize={14} label="Copy" onClick={() => onCopy(m.content)} />
                        {i === lastAssistantIndex && !sending && (
                          <IconButton icon={RotateCcw} iconSize={14} label="Retry" onClick={onRetry} />
                        )}
                        {m.createdAt && revealedTimestamp === i && (
                          <span className="ml-1 text-[11px] text-ink-muted dark:text-mist-muted">
                            {formatTimestamp(m.createdAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {awaitingFirstToken && (
              <div className="flex justify-start">
                {statusLabel ? (
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-stone bg-paper-card px-3 py-1.5 text-xs font-medium text-ink-muted dark:border-stone-dark dark:bg-ink-bg-card dark:text-mist-muted">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-bloom" />
                    {statusLabel}
                  </div>
                ) : (
                  <div className="flex items-center gap-1 py-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted [animation-delay:-0.3s] dark:bg-mist-muted" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted [animation-delay:-0.15s] dark:bg-mist-muted" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted dark:bg-mist-muted" />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <div ref={listEndRef} />
      </div>

      {showScrollToLatest && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 mx-auto flex max-w-[720px] justify-end px-3">
          <button
            type="button"
            onClick={onScrollToLatest}
            aria-label="Scroll to latest"
            className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-stone bg-paper-card text-ink shadow-raised transition-colors hover:bg-stone/40 dark:border-stone-dark dark:bg-ink-bg-card dark:text-paper dark:shadow-raised-dark dark:hover:bg-stone-dark/40"
          >
            <Icon icon={ArrowDown} size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
