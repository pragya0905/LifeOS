// Shared style primitives for the premium/minimal design system.
// Plain className strings (not components) so they drop into existing
// JSX without changing each page's structure.

export const page = "mx-auto mt-10 w-full max-w-2xl px-4 pb-16";

export const pageTitle = "font-display mb-6 text-3xl font-medium text-ink dark:text-cream";

export const sectionLabel =
  "text-xs font-medium uppercase tracking-wide text-ink-muted dark:text-fog-muted";

export const card =
  "rounded-2xl border border-stone bg-cream-card p-6 shadow-sm dark:border-stone-dark dark:bg-charcoal-card";

export const label = "mb-1 block text-xs font-medium text-ink-muted dark:text-fog-muted";

export const input =
  "rounded-xl border border-stone bg-cream-card px-3 py-2 text-sm text-ink focus:border-sage focus:outline-none dark:border-stone-dark dark:bg-charcoal-card dark:text-cream";

export const primaryButton =
  "rounded-full bg-sage px-5 py-2 text-sm font-medium text-cream-card transition-colors hover:bg-sage-light disabled:opacity-50";

export const secondaryButton =
  "rounded-full border border-stone px-4 py-1.5 text-sm text-ink transition-colors hover:bg-stone/40 dark:border-stone-dark dark:text-cream dark:hover:bg-stone-dark/40";

export const pillButton =
  "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50";

export const pillButtonInactive =
  "border-stone text-ink-muted hover:bg-stone/40 dark:border-stone-dark dark:text-fog-muted dark:hover:bg-stone-dark/40";

export const pillButtonDone = "border-sage bg-sage text-cream-card";
export const pillButtonMissed = "border-terracotta bg-terracotta text-cream-card";

export const badge = "rounded-full bg-sage-soft px-2 py-0.5 text-xs font-medium text-sage dark:bg-sage-soft-dark dark:text-sage-light";

export const errorText = "text-sm text-terracotta";
export const mutedText = "text-sm text-ink-muted dark:text-fog-muted";

export const priorityBadgeClass: Record<"Low" | "Medium" | "High", string> = {
  Low: "bg-stone text-ink-muted dark:bg-stone-dark dark:text-fog-muted",
  Medium: "bg-[#F0E4C8] text-[#8A6A22] dark:bg-[#4A3D1E] dark:text-[#E3C878]",
  High: "bg-terracotta-soft text-terracotta dark:bg-terracotta-soft-dark dark:text-[#D89478]",
};
