import type { InputHTMLAttributes } from "react";

// Component form of ui.ts's `input`/`label` strings. min-h-11 keeps the 44px touch
// target regardless of the browser's own default text-input height.
export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`min-h-11 rounded-control border border-stone bg-paper-card px-3 py-2 text-sm text-ink focus:border-bloom focus:outline-none focus-visible:ring-2 focus-visible:ring-bloom/40 focus-visible:ring-offset-1 focus-visible:ring-offset-paper-card dark:border-stone-dark dark:bg-ink-bg-card dark:text-paper dark:focus-visible:ring-offset-ink-bg-card ${className}`}
      {...props}
    />
  );
}

export function FieldLabel({ children, htmlFor }: { children: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-ink-muted dark:text-mist-muted">
      {children}
    </label>
  );
}
