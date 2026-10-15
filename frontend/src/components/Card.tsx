import type { HTMLAttributes, ReactNode } from "react";

// Component form of ui.ts's `card` string, for new/touched call sites — adds the
// `--shadow-raised` elevation option for surfaces that need to read as "above" the
// page (e.g. inside a Modal/BottomSheet), which a plain border can't express.
export function Card({
  raised = false,
  className = "",
  children,
  ...props
}: {
  raised?: boolean;
  className?: string;
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-card border border-stone bg-paper-card p-6 dark:border-stone-dark dark:bg-ink-bg-card ${
        raised ? "shadow-raised dark:shadow-raised-dark" : "shadow-card dark:shadow-card-dark"
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
