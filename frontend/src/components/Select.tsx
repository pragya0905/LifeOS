import type { SelectHTMLAttributes } from "react";

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`min-h-11 rounded-control border border-stone bg-paper-card px-3 py-2 text-sm text-ink focus:border-bloom focus:outline-none focus-visible:ring-2 focus-visible:ring-bloom/40 dark:border-stone-dark dark:bg-ink-bg-card dark:text-paper ${className}`}
      {...props}
    />
  );
}
