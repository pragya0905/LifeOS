// A labeled tab strip for in-page sections (not primary navigation — that's Layout's
// bottom tab bar / desktop sidebar). E.g. Calendar's day/week/agenda switch (Phase 5).
export function Tabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" className="inline-flex gap-1 rounded-full border border-stone p-1 dark:border-stone-dark">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`min-h-9 rounded-full px-3.5 py-1 text-sm font-medium transition-colors ${
            value === opt.value
              ? "bg-bloom text-paper-card"
              : "text-ink-muted hover:bg-stone/40 dark:text-mist-muted dark:hover:bg-stone-dark/40"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
