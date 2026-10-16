import type { ButtonHTMLAttributes, ReactNode } from "react";

// A tappable pill — the quick-add sheet's pinned Today chips (water, mood, period-
// started) and the FAB sheet's category/target chips are built from this.
export function Chip({
  active = false,
  className = "",
  children,
  ...props
}: {
  active?: boolean;
  className?: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
        active
          ? "border-bloom bg-bloom text-paper-card"
          : "border-stone text-ink-muted hover:bg-stone/40 dark:border-stone-dark dark:text-mist-muted dark:hover:bg-stone-dark/40"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
