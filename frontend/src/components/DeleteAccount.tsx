import { useState } from "react";
import { useApi } from "../api/useApi";
import { useAuth } from "../auth/AuthContext";
import { card, errorText, input, mutedText, sectionLabel } from "./ui";

const CONFIRM_TEXT = "DELETE";

export default function DeleteAccount() {
  const { request } = useApi();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await request("/account", { method: "DELETE" });
      await signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
      setDeleting(false);
    }
  }

  return (
    <div className={`${card} border-terracotta/40`}>
      <h2 className={`mb-2 ${sectionLabel}`}>Danger zone</h2>
      {!open ? (
        <>
          <p className={`mb-3 ${mutedText}`}>
            Permanently delete your account and all data — tasks, journal entries, habits,
            logs, medications, and routines. This cannot be undone.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full border border-terracotta px-3 py-1.5 text-xs font-medium text-terracotta transition-colors hover:bg-terracotta-soft dark:hover:bg-terracotta-soft-dark"
          >
            Delete account
          </button>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-terracotta">
            This permanently deletes everything — there is no undo. Type{" "}
            <span className="font-mono font-semibold">{CONFIRM_TEXT}</span> to confirm.
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={CONFIRM_TEXT}
            className={`max-w-[200px] ${input}`}
          />
          {error && <p className={errorText}>{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={confirmText !== CONFIRM_TEXT || deleting}
              onClick={handleDelete}
              className="rounded-full bg-terracotta px-4 py-1.5 text-xs font-medium text-cream-card transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Permanently delete my account"}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => {
                setOpen(false);
                setConfirmText("");
                setError(null);
              }}
              className="rounded-full border border-stone px-4 py-1.5 text-xs text-ink transition-colors hover:bg-stone/40 dark:border-stone-dark dark:text-cream dark:hover:bg-stone-dark/40"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
