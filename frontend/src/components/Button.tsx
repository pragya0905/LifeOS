import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "bg-bloom text-paper-card hover:bg-bloom-light",
  secondary:
    "border border-stone text-ink hover:bg-stone/40 dark:border-stone-dark dark:text-paper dark:hover:bg-stone-dark/40",
  ghost: "text-ink hover:bg-stone/40 dark:text-paper dark:hover:bg-stone-dark/40",
  danger: "border border-stone text-alert hover:bg-alert-soft dark:border-stone-dark dark:hover:bg-alert-soft-dark",
};

// Supersedes ad hoc <button className={primaryButton}>-style call sites — same visual
// result, but a real component so size/variant stay consistent as more screens adopt it.
// ui.ts's primaryButton/secondaryButton strings stay in place for now (pages not yet
// migrated keep working); this is the version new/touched call sites should reach for.
export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: {
  variant?: Variant;
  className?: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-5 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${VARIANT_CLASS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
