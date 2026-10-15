import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { Icon } from "./Icon";

// A tappable icon-only control sized to the 44px minimum touch target, regardless of
// how small the icon itself is drawn — size the icon via `iconSize`, not by shrinking
// the button's own hit area.
export function IconButton({
  icon,
  iconSize = 18,
  label,
  className = "",
  ...props
}: {
  icon: LucideIcon;
  iconSize?: number;
  label: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-stone/40 disabled:opacity-50 dark:text-mist-muted dark:hover:bg-stone-dark/40 ${className}`}
      {...props}
    >
      <Icon icon={icon} size={iconSize} />
    </button>
  );
}
