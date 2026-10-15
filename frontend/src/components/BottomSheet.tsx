import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Icon } from "./Icon";

// Generalizes the hand-rolled sheet markup Layout.tsx's "More" menu built inline — Phase 2
// swaps that usage (and the new quick-add sheet) onto this, so the pattern exists once.
// Respects prefers-reduced-motion by just not animating (no JS branching needed — the
// animate-fade-in-up keyframe itself is skipped at the CSS level for reduced-motion users
// in Phase 4's motion-token pass; this component doesn't need its own guard).
export function BottomSheet({
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

  // Pressing the device back button (or browser back) while a sheet is open should close
  // the sheet instead of navigating away. Pushes one history entry while open; a pop
  // (real back gesture) closes the sheet via onClose.
  //
  // If the sheet instead closes some other way (X button, backdrop, a quick-add form
  // completing) the pushed entry is popped in cleanup so back-history isn't left polluted
  // — but ONLY if our dummy entry is still the current one. Tapping a nav link *inside*
  // the sheet pushes its own route entry on top of ours first (React Router's own
  // pushState), and in that case calling history.back() here would wrongly undo that
  // navigation instead of just removing our marker — the state check below detects that
  // and skips the cleanup pop, accepting one harmless extra back-press in that one case
  // rather than ever reverting a real navigation.
  const closingViaPopRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    window.history.pushState({ lifeosSheet: true }, "");

    function onPopState() {
      closingViaPopRef.current = true;
      onClose();
    }
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
      if (!closingViaPopRef.current && (window.history.state as { lifeosSheet?: boolean } | null)?.lifeosSheet) {
        window.history.back();
      }
      closingViaPopRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40 backdrop-blur-sm dark:bg-ink-bg/70" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-fade-in-up relative w-full max-w-2xl rounded-t-sheet border border-b-0 border-stone bg-paper-card p-5 pb-8 shadow-raised dark:border-stone-dark dark:bg-ink-bg-card dark:shadow-raised-dark"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 2rem)" }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-stone dark:bg-stone-dark" />
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-medium text-ink dark:text-paper">{title}</span>
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
