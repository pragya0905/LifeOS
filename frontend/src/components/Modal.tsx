import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { Icon } from "./Icon";

// A centered dialog, for confirmations and desktop-width forms — the BottomSheet is the
// mobile-appropriate equivalent for most flows; Modal is for things that don't belong
// anchored to the bottom edge (e.g. a destructive-action confirmation).
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40 backdrop-blur-sm dark:bg-ink-bg/70" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-pop relative w-full max-w-sm rounded-card border border-stone bg-paper-card p-6 shadow-raised dark:border-stone-dark dark:bg-ink-bg-card dark:shadow-raised-dark"
      >
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <span className="font-display text-lg font-medium text-ink dark:text-paper">{title}</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-stone/40 dark:text-mist-muted dark:hover:bg-stone-dark/40"
            >
              <Icon icon={X} size={16} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
