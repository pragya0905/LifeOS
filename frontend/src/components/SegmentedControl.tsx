// Distinct from Tabs: a full-width, equal-segment control for a small fixed set of
// mutually-exclusive options (e.g. ThemeToggle's Light/Dark/System, Wishes' "Track
// progress by") rather than content-hugging navigation pills.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-control border border-stone bg-stone/30 p-1 dark:border-stone-dark dark:bg-stone-dark/30">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`min-h-9 flex-1 rounded-[calc(var(--radius-control)-0.2rem)] px-2 py-1 text-xs font-medium transition-colors ${
            value === opt.value
              ? "bg-paper-card text-ink shadow-card dark:bg-ink-bg-card dark:text-paper"
              : "text-ink-muted dark:text-mist-muted"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
