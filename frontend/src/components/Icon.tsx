import type { LucideIcon } from "lucide-react";

// Every icon in the app renders through this so stroke width and size stay consistent —
// import the specific lucide icon you need (named import only, never `import * as`) and
// pass it here rather than sizing/stroking it ad hoc per call site.
export function Icon({
  icon: LucideIconComponent,
  size = 18,
  strokeWidth = 1.8,
  className = "",
}: {
  icon: LucideIcon;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return <LucideIconComponent size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />;
}
