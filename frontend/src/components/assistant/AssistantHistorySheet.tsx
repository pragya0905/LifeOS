import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { useApi } from "../../api/useApi";
import { useToast } from "../Toast";
import { Icon } from "../Icon";
import { IconButton } from "../IconButton";
import { BottomSheet } from "../BottomSheet";
import { mutedText } from "../ui";

export interface ConversationSummary {
  conversationId: string;
  preview: string;
  lastMessageAt: string;
}

// Matches Toast.tsx's own DEFAULT_DURATION_MS — the deferred-delete window and the toast's
// own visible lifetime must stay in lockstep, since "Undo" only works while both are alive.
const UNDO_WINDOW_MS = 5000;

function formatConversationDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" });
}

export function AssistantHistorySheet({
  open,
  onClose,
  conversations,
  loading,
  onReopen,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  conversations: ConversationSummary[];
  loading: boolean;
  onReopen: (conversationId: string) => void;
  /** Called once a delete is actually committed (the undo window passed) — not on tap. */
  onDeleted: (conversationId: string) => void;
}) {
  const { request } = useApi();
  const { show: showToast } = useToast();
  const [items, setItems] = useState(conversations);
  const [search, setSearch] = useState("");
  const pendingTimers = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (open) {
      setItems(conversations);
      setSearch("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conversations]);

  // Any delete still pending (undo window not yet elapsed) when the sheet unmounts is
  // committed immediately rather than silently lost or silently cancelled.
  useEffect(() => {
    const timers = pendingTimers.current;
    return () => {
      for (const [id, timer] of timers) {
        window.clearTimeout(timer);
        request(`/assistant/conversations/${id}`, { method: "DELETE" }).catch(() => {});
        onDeleted(id);
      }
      timers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => c.preview.toLowerCase().includes(q));
  }, [items, search]);

  function handleDelete(c: ConversationSummary, e: React.MouseEvent) {
    e.stopPropagation();
    setItems((prev) => prev.filter((x) => x.conversationId !== c.conversationId));
    const timer = window.setTimeout(() => {
      pendingTimers.current.delete(c.conversationId);
      request(`/assistant/conversations/${c.conversationId}`, { method: "DELETE" })
        .then(() => onDeleted(c.conversationId))
        .catch(() => {
          // The delete call failed after the undo window passed — bring the row back rather
          // than silently losing it from the list while it still exists server-side.
          setItems((prev) => [...prev, c].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)));
        });
    }, UNDO_WINDOW_MS);
    pendingTimers.current.set(c.conversationId, timer);
    showToast("Conversation deleted", {
      durationMs: UNDO_WINDOW_MS,
      undo: () => {
        const pending = pendingTimers.current.get(c.conversationId);
        if (pending !== undefined) {
          window.clearTimeout(pending);
          pendingTimers.current.delete(c.conversationId);
        }
        setItems((prev) => [...prev, c].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)));
      },
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Conversations">
      <div className="mb-3 flex items-center gap-2 rounded-control border border-stone px-3 dark:border-stone-dark">
        <Icon icon={Search} size={15} className="text-ink-muted dark:text-mist-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search conversations"
          className="min-h-11 flex-1 border-0 bg-transparent px-0 py-0 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-0 dark:text-paper dark:placeholder:text-mist-muted"
        />
      </div>

      {loading ? (
        <p className={mutedText}>Loading…</p>
      ) : filtered.length === 0 ? (
        <p className={mutedText}>{search ? "No matching conversations." : "No past conversations yet."}</p>
      ) : (
        <ul className="flex max-h-[55vh] flex-col gap-1.5 overflow-y-auto">
          {filtered.map((c) => (
            <li key={c.conversationId}>
              <div className="flex items-center gap-1 rounded-control border border-stone pl-3.5 pr-1 transition-colors hover:bg-stone/40 dark:border-stone-dark dark:hover:bg-stone-dark/40">
                <button
                  type="button"
                  onClick={() => onReopen(c.conversationId)}
                  className="min-w-0 flex-1 py-2.5 text-left"
                >
                  <span className="block truncate text-sm text-ink dark:text-paper">{c.preview}</span>
                  <span className="block text-xs text-ink-muted dark:text-mist-muted">
                    {formatConversationDate(c.lastMessageAt)}
                  </span>
                </button>
                <IconButton icon={Trash2} iconSize={15} label="Delete conversation" onClick={(e) => handleDelete(c, e)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </BottomSheet>
  );
}
