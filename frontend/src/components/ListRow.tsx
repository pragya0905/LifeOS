import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Icon } from "./Icon";

// A consistent row primitive for list-shaped content (More sheet links, recent-wishes
// in the quick-add sheet, etc.) — min-h-11 keeps every row tappable at the 44px target
// even when its content is a single short line.
export function ListRow({
  icon,
  iconClassName = "text-ink-muted dark:text-mist-muted",
  title,
  subtitle,
  trailing,
  onClick,
}: {
  icon?: LucideIcon;
  iconClassName?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex min-h-11 w-full items-center gap-3 rounded-control px-2 py-2 text-left transition-colors ${
        onClick ? "hover:bg-stone/40 dark:hover:bg-stone-dark/40" : ""
      }`}
    >
      {icon && <Icon icon={icon} size={18} className={`shrink-0 ${iconClassName}`} />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink dark:text-paper">{title}</div>
        {subtitle && <div className="truncate text-xs text-ink-muted dark:text-mist-muted">{subtitle}</div>}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </Tag>
  );
}
