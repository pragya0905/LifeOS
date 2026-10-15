// A real switch control — distinct from Checkbox, for on/off settings (e.g. Settings'
// future reduced-motion/sound toggles) rather than multi-select lists.
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-bloom" : "bg-stone dark:bg-stone-dark"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-paper-card shadow-card transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
