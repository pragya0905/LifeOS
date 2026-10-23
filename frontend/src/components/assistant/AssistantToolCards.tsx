import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Check,
  CheckSquare,
  Droplets,
  Eye,
  Flag,
  ListChecks,
  Loader2,
  Minus,
  Pill,
  Receipt,
  Redo2,
  RotateCcw,
  ScrollText,
  Sparkles,
  Target,
  Undo2,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { useApi } from "../../api/useApi";
import { Icon } from "../Icon";
import {
  failureHeadline,
  pageForTool,
  presentCard,
  redoRequest,
  removedLabel,
  undoPath,
  type CardVisual,
  type MetaPart,
  type ToolFailure,
  type ToolResultEntry,
} from "../../lib/toolCards";

// Variant A: one compact card per tool result, under the reply. The whole card is a tap-through
// to the item's list page; Undo is its own button on top of that.

const STACK_CAP = 4;

const VISUALS: Record<CardVisual, { icon: LucideIcon; tile: string }> = {
  task: { icon: CheckSquare, tile: "bg-bloom-soft text-bloom dark:bg-bloom-soft-dark dark:text-bloom-light" },
  medication: { icon: Pill, tile: "bg-medication-soft text-medication dark:bg-medication-soft-dark dark:text-[#94a3ff]" },
  expense: { icon: Receipt, tile: "bg-budget-soft text-budget dark:bg-budget-soft-dark dark:text-[#8db6ea]" },
  routine: { icon: ListChecks, tile: "bg-routine-soft text-routine dark:bg-routine-soft-dark dark:text-[#66c9c2]" },
  habit: { icon: Droplets, tile: "bg-slate-soft text-slate-ink dark:bg-slate-soft-dark dark:text-slate-ink-dark" },
  wish: { icon: Target, tile: "bg-bloom-soft text-bloom dark:bg-bloom-soft-dark dark:text-bloom-light" },
  log: { icon: ScrollText, tile: "bg-slate-soft text-slate-ink dark:bg-slate-soft-dark dark:text-slate-ink-dark" },
  plan: { icon: Utensils, tile: "bg-slate-soft text-slate-ink dark:bg-slate-soft-dark dark:text-slate-ink-dark" },
  other: { icon: Sparkles, tile: "bg-slate-soft text-slate-ink dark:bg-slate-soft-dark dark:text-slate-ink-dark" },
};

// The coral on white is too faint for small text, so light uses a deeper red (as in the mockup).
const actionText = "text-[#c93a29] dark:text-bloom-light";
const cardShell = "rounded-card border border-stone bg-paper-card dark:border-stone-dark dark:bg-ink-bg-card";
const buttonBase =
  "flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-control px-3 text-sm font-semibold transition-colors hover:bg-stone/40 disabled:opacity-70 disabled:hover:bg-transparent dark:hover:bg-stone-dark/40";

const PRIORITY_COLOR = {
  High: "text-alert dark:text-alert-light",
  Medium: "text-amber-ink dark:text-amber-ink-dark",
  Low: "text-success-ink dark:text-success-ink-dark",
} as const;

function Meta({ part }: { part: MetaPart }) {
  if (part.priority) {
    return (
      <span className={`inline-flex items-center gap-1 font-semibold ${PRIORITY_COLOR[part.priority]}`}>
        <Icon icon={Flag} size={12} />
        {part.text}
      </span>
    );
  }
  return <span className="tabular-nums">{part.text}</span>;
}

type Phase = "idle" | "undoing" | "removed" | "redoing";

function ResultCard({ entry, tapThrough }: { entry: ToolResultEntry; tapThrough: boolean }) {
  const { request } = useApi();
  const [phase, setPhase] = useState<Phase>("idle");
  const [failed, setFailed] = useState<"undo" | "redo" | null>(null);
  // After a Redo the card stands for the newly created item, so Undo uses that id.
  const [liveId, setLiveId] = useState<string | undefined>(undefined);

  const present = presentCard(entry);
  if (!present) return null;
  const current: ToolResultEntry = liveId ? { ...entry, result: { ...entry.result, id: liveId } } : entry;
  const undo = undoPath(current);
  const redo = redoRequest(entry);
  const page = pageForTool(entry.name);
  const { icon, tile } = VISUALS[present.visual];
  const removed = phase === "removed" || phase === "redoing";

  async function handleUndo() {
    if (!undo) return;
    setPhase("undoing");
    setFailed(null);
    try {
      await request(undo, { method: "DELETE" });
      setPhase("removed");
    } catch {
      setPhase("idle");
      setFailed("undo");
    }
  }

  async function handleRedo() {
    if (!redo) return;
    setPhase("redoing");
    setFailed(null);
    try {
      const created = await request<Record<string, unknown>>(redo.path, { method: "POST", body: JSON.stringify(redo.body) });
      const id = created[redo.idField];
      setLiveId(typeof id === "string" ? id : undefined);
      setPhase("idle");
    } catch {
      setPhase("removed");
      setFailed("redo");
    }
  }

  const spinner = <Icon icon={Loader2} size={15} className="motion-safe:animate-spin" />;

  return (
    <div>
      <div
        className={`relative flex min-h-[60px] items-center gap-2.5 py-2 pl-3 pr-1.5 ${cardShell} ${
          removed ? "border-dashed !bg-transparent dark:!bg-transparent" : ""
        }`}
      >
        {!removed && tapThrough && (
          <Link
            to={page.path}
            aria-label={`Open ${page.label}: ${present.title}`}
            className="absolute inset-0 rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom"
          />
        )}
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${tile}`}>
          <Icon icon={icon} size={17} />
        </span>
        <div className="pointer-events-none min-w-0 flex-1">
          <div
            className={`break-words text-sm font-semibold leading-snug ${
              removed ? "font-medium text-ink-muted line-through dark:text-mist-muted" : "text-ink dark:text-paper"
            }`}
          >
            {present.title}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted dark:text-mist-muted">
            {removed ? (
              <span className="inline-flex items-center gap-1 font-semibold">
                <Icon icon={Minus} size={13} />
                {removedLabel(entry.name)}
              </span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1 font-semibold text-success-ink dark:text-success-ink-dark">
                  <Icon icon={Check} size={13} />
                  {present.verb}
                </span>
                {present.meta.map((m, i) => (
                  <Meta key={i} part={m} />
                ))}
              </>
            )}
          </div>
        </div>
        {!removed && undo && (
          <button
            type="button"
            onClick={handleUndo}
            disabled={phase === "undoing"}
            className={`relative z-10 ${buttonBase} ${actionText}`}
          >
            {phase === "undoing" ? spinner : <Icon icon={Undo2} size={16} />}
            {phase === "undoing" ? "Removing…" : "Undo"}
          </button>
        )}
        {removed && redo && (
          <button
            type="button"
            onClick={handleRedo}
            disabled={phase === "redoing"}
            className={`relative z-10 ${buttonBase} ${actionText}`}
          >
            {phase === "redoing" ? spinner : <Icon icon={Redo2} size={16} />}
            {phase === "redoing" ? "Adding back…" : "Redo"}
          </button>
        )}
      </div>
      {failed && (
        <p role="alert" className="px-1 pt-1 text-xs text-alert dark:text-alert-light">
          {failed === "undo" ? "Couldn't remove it. Try again." : "Couldn't add it back. Try again."}
        </p>
      )}
    </div>
  );
}

function FailureCard({
  failure,
  reply,
  canRetry,
  onRetry,
}: {
  failure: ToolFailure;
  reply: ReactNode;
  canRetry: boolean;
  onRetry: () => void;
}) {
  const page = pageForTool(failure.name);
  // After a server error or a timeout the item may already exist, so Retry could duplicate it:
  // the card says so and offers a way to look first.
  const mayHaveSaved = failure.kind === "server" || failure.kind === "timeout";
  return (
    <div
      role="alert"
      className="rounded-card border border-alert/40 bg-alert-soft p-3 dark:border-alert-light/30 dark:bg-alert-soft-dark"
    >
      <div className="flex items-start gap-2">
        <Icon icon={AlertCircle} size={18} className="mt-0.5 text-alert dark:text-alert-light" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-snug text-ink dark:text-paper">{failureHeadline(failure.name)}</div>
          <div className="mt-1 text-[13px] leading-relaxed text-ink dark:text-paper">
            {failure.useReply ? reply : failure.reason}
          </div>
          {mayHaveSaved && (
            <p className="mt-1 text-xs text-ink-muted dark:text-mist-muted">
              It may have been saved already, so check {page.label} before you retry.
            </p>
          )}
        </div>
      </div>
      {(canRetry || mayHaveSaved) && (
        <div className="mt-1 flex flex-wrap justify-end gap-1">
          {mayHaveSaved && (
            <Link to={page.path} className={`${buttonBase} border border-stone dark:border-stone-dark ${actionText}`}>
              Check {page.label}
            </Link>
          )}
          {canRetry && (
            <button type="button" onClick={onRetry} className={`${buttonBase} ${actionText}`}>
              <Icon icon={RotateCcw} size={16} />
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function AssistantToolCards({
  entries,
  failures,
  quietNotes,
  reply,
  canRetry,
  onRetry,
  cap = STACK_CAP,
  onShowMore,
  tapThrough = true,
}: {
  entries: ToolResultEntry[];
  failures: ToolFailure[];
  quietNotes: string[];
  // The assistant's own sentence, for a failure card that uses it as its reason.
  reply: ReactNode;
  canRetry: boolean;
  onRetry: () => void;
  // How many cards show before the rest are folded away.
  cap?: number;
  // When set, the folded cards are not expanded in place: the button reads "N more in chat" and
  // calls this instead (the voice screen sends you to the chat, where they all are).
  onShowMore?: () => void;
  // Whether a card is a link to its list page. Off in voice, so a tap cannot leave the session.
  tapThrough?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (entries.length === 0 && failures.length === 0 && quietNotes.length === 0) return null;

  const shown = expanded && !onShowMore ? entries : entries.slice(0, cap);
  const hidden = entries.length - shown.length;

  return (
    <div className="mt-2.5 flex flex-col gap-2">
      {shown.map((entry, i) => (
        <ResultCard key={i} entry={entry} tapThrough={tapThrough} />
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => (onShowMore ? onShowMore() : setExpanded(true))}
          className={`${buttonBase} border border-stone dark:border-stone-dark ${actionText}`}
        >
          {onShowMore ? `${hidden} more in chat` : `Show ${hidden} more`}
        </button>
      )}
      {failures.map((f, i) => (
        <FailureCard key={i} failure={f} reply={reply} canRetry={canRetry} onRetry={onRetry} />
      ))}
      {quietNotes.map((note) => (
        <p key={note} className="inline-flex items-center gap-1.5 text-xs text-ink-muted dark:text-mist-muted">
          <Icon icon={note === "Delete request sent" ? Minus : Eye} size={13} />
          {note}
        </p>
      ))}
    </div>
  );
}
