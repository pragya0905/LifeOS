// Shared style primitives for the premium/minimal design system.
// Plain className strings (not components) so they drop into existing
// JSX without changing each page's structure.

export const page = "mx-auto mt-10 w-full max-w-2xl px-4 pb-16";

export const pageTitle = "font-display mb-6 text-3xl font-medium text-ink dark:text-paper";

export const sectionLabel =
  "text-xs font-medium uppercase tracking-wide text-ink-muted dark:text-mist-muted";

export const card =
  "rounded-2xl border border-stone bg-paper-card p-6 shadow-sm dark:border-stone-dark dark:bg-ink-bg-card";

export const label = "mb-1 block text-xs font-medium text-ink-muted dark:text-mist-muted";

export const input =
  "rounded-xl border border-stone bg-paper-card px-3 py-2 text-sm text-ink focus:border-bloom focus:outline-none focus-visible:ring-2 focus-visible:ring-bloom/40 focus-visible:ring-offset-1 focus-visible:ring-offset-paper-card dark:border-stone-dark dark:bg-ink-bg-card dark:text-paper dark:focus-visible:ring-offset-ink-bg-card";

export const primaryButton =
  "rounded-full bg-bloom px-5 py-2 text-sm font-medium text-paper-card transition-colors hover:bg-bloom-light disabled:opacity-50";

export const secondaryButton =
  "rounded-full border border-stone px-4 py-1.5 text-sm text-ink transition-colors hover:bg-stone/40 dark:border-stone-dark dark:text-paper dark:hover:bg-stone-dark/40";

export const pillButton =
  "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50";

export const pillButtonInactive =
  "border-stone text-ink-muted hover:bg-stone/40 dark:border-stone-dark dark:text-mist-muted dark:hover:bg-stone-dark/40";

export const pillButtonDone = "border-bloom bg-bloom text-paper-card";
export const pillButtonMissed = "border-alert bg-alert text-paper-card";
export const pillButtonSkipped = "border-mist-muted bg-mist-muted text-paper-card";

export const badge = "rounded-full bg-bloom-soft px-2 py-0.5 text-xs font-medium text-bloom dark:bg-bloom-soft-dark dark:text-bloom-light";

export const errorText = "text-sm text-alert";
export const mutedText = "text-sm text-ink-muted dark:text-mist-muted";

export const priorityBadgeClass: Record<"Low" | "Medium" | "High", string> = {
  Low: "bg-stone text-ink-muted dark:bg-stone-dark dark:text-mist-muted",
  Medium: "bg-amber-soft text-amber-ink dark:bg-amber-soft-dark dark:text-amber-ink-dark",
  High: "bg-alert-soft text-alert dark:bg-alert-soft-dark dark:text-alert-light",
};
