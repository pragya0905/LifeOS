import { useLayoutEffect, useRef } from "react";
import { AlertCircle, Check, FileText, X } from "lucide-react";
import { Icon } from "../Icon";
import {
  formatMegabytes,
  MAX_TOTAL_ATTACHMENT_BYTES,
  type PendingAttachment,
} from "../../hooks/usePendingAttachments";

// One chip per file above the composer. The row scrolls sideways when it overflows; file names
// wrap rather than truncate, since they're text the user needs to read.
export function AssistantAttachmentTray({
  items,
  totalBytes,
  overLimit,
  onRetry,
  onRetryFailed,
  onRemove,
}: {
  items: PendingAttachment[];
  totalBytes: number;
  overLimit: boolean;
  onRetry: (id: string) => void;
  onRetryFailed: () => void;
  onRemove: (id: string) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  // The row always opens at its first chip. A failed chip can sit off to the right, which is
  // why the summary line below exists; this keeps the row from opening already scrolled.
  useLayoutEffect(() => {
    if (listRef.current) listRef.current.scrollLeft = 0;
  }, [items.length]);

  if (items.length === 0) return null;
  const failedCount = items.filter((i) => i.status === "error").length;
  return (
    <div className="mb-1.5 flex flex-col gap-1.5">
      {failedCount > 0 && (
        <div className="flex items-center justify-between gap-2 px-1 text-xs text-alert">
          <span>
            {failedCount === 1 ? "1 file didn't upload" : `${failedCount} files didn't upload`}
          </span>
          <button
            type="button"
            onClick={onRetryFailed}
            className="flex h-11 items-center rounded-full px-3 text-sm font-medium text-bloom hover:underline"
          >
            Retry
          </button>
        </div>
      )}
      <ul ref={listRef} className="flex gap-2 overflow-x-auto pb-1" aria-label="Attached files">
        {items.map((item) => (
          <AttachmentChip key={item.id} item={item} onRetry={onRetry} onRemove={onRemove} />
        ))}
      </ul>
      {overLimit && (
        <p role="alert" className="px-1 text-xs text-alert">
          These files total {formatMegabytes(totalBytes)}. The limit is {formatMegabytes(MAX_TOTAL_ATTACHMENT_BYTES)}{" "}
          per message — remove a file to send.
        </p>
      )}
    </div>
  );
}

function AttachmentChip({
  item,
  onRetry,
  onRemove,
}: {
  item: PendingAttachment;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <li className="flex w-60 shrink-0 items-center gap-2 rounded-control border border-stone bg-paper-card py-1 pl-1 dark:border-stone-dark dark:bg-ink-bg-card">
      {item.previewUrl ? (
        <img src={item.previewUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-stone/40 text-ink-muted dark:bg-stone-dark/40 dark:text-mist-muted">
          <Icon icon={FileText} size={18} />
        </span>
      )}
      <div className="min-w-0 flex-1 py-0.5">
        <p className="break-all text-xs font-medium text-ink dark:text-paper">{item.file.name}</p>
        <ChipStatus item={item} onRetry={onRetry} />
      </div>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        aria-label={`Remove ${item.file.name}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-stone/40 dark:text-mist-muted dark:hover:bg-stone-dark/40"
      >
        <Icon icon={X} size={14} />
      </button>
    </li>
  );
}

// Every state carries an icon and a word, never colour alone.
function ChipStatus({ item, onRetry }: { item: PendingAttachment; onRetry: (id: string) => void }) {
  if (item.status === "uploading") {
    const pct = Math.round(item.progress * 100);
    return (
      <div className="mt-1">
        <p className="text-[11px] tabular-nums text-ink-muted dark:text-mist-muted">Uploading {pct}%</p>
        <div
          role="progressbar"
          aria-label={`Uploading ${item.file.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-stone dark:bg-stone-dark"
        >
          <div className="h-full bg-bloom transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }
  if (item.status === "error") {
    return (
      <div className="flex items-center gap-1">
        <Icon icon={AlertCircle} size={12} className="shrink-0 text-alert" />
        <span className="text-[11px] text-alert">Upload failed</span>
        <button
          type="button"
          onClick={() => onRetry(item.id)}
          className="flex h-11 items-center rounded-full px-2 text-xs font-medium text-bloom hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }
  return (
    <p className="flex items-center gap-1 text-[11px] tabular-nums text-ink-muted dark:text-mist-muted">
      <Icon icon={Check} size={12} /> Ready · {formatMegabytes(item.file.size)}
    </p>
  );
}
