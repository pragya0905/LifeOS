import { Check } from "lucide-react";
import { Icon } from "./Icon";

// A large-tap-area checkbox (the full 44px control, not just the visual 20px box) for
// multi-select lists — e.g. a quick-add sheet's step/item toggles.
export function Checkbox({
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
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 items-center gap-2.5 text-left disabled:opacity-50"
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
          checked
            ? "border-bloom bg-bloom text-paper-card"
            : "border-stone bg-paper-card dark:border-stone-dark dark:bg-ink-bg-card"
        }`}
      >
        {checked && <Icon icon={Check} size={13} strokeWidth={2.5} />}
      </span>
      <span className="text-sm text-ink dark:text-paper">{label}</span>
    </button>
  );
}
