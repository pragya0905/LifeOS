import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Icon } from "./Icon";
import { Card } from "./Card";

// The Dashboard's hero metric strip (Phase 3) is built from these — a single number-led
// tile, not a full card's worth of chrome. tabular-nums is load-bearing here: these are
// the numbers most likely to sit side-by-side and visibly jitter without it.
export function StatTile({
  label,
  value,
  icon,
  accentClassName = "text-ink dark:text-paper",
  sub,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  accentClassName?: string;
  sub?: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-muted dark:text-mist-muted">
        {icon && <Icon icon={icon} size={13} />}
        {label}
      </div>
      <div className={`font-display text-2xl font-medium tabular-nums ${accentClassName}`}>{value}</div>
      {sub && <div className="text-xs text-ink-muted dark:text-mist-muted">{sub}</div>}
    </Card>
  );
}
