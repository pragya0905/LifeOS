// A linear counterpart to ProgressRing — e.g. Budget's spent-vs-limit bars (Help.tsx
// already describes this behavior; this is the shared visual for it going forward).
export function ProgressBar({
  fraction,
  colorClassName = "bg-bloom",
  trackClassName = "bg-stone dark:bg-stone-dark",
  label,
}: {
  /** 0-1; values above 1 still render a full bar, callers decide how to flag overage */
  fraction: number;
  colorClassName?: string;
  trackClassName?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(1, fraction));
  return (
    <div
      className={`h-2 w-full overflow-hidden rounded-full ${trackClassName}`}
      role="progressbar"
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={`h-full rounded-full transition-[width] ${colorClassName}`}
        style={{ width: `${clamped * 100}%`, transitionDuration: "var(--duration-base)" }}
      />
    </div>
  );
}
