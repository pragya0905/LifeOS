import type { ReactNode } from "react";

// Structurally compatible with both lucide's icon components and the hand-drawn
// StreakFlame exception, so nav lists that mix the two (Wishes/Cycle use the flame
// instead of a lucide icon) can still render through one Icon call.
export type IconComponent = (props: {
  size?: number;
  strokeWidth?: number;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}) => ReactNode;

// Every icon in the app renders through this so stroke width and size stay consistent —
// import the specific lucide icon you need (named import only, never `import * as`) and
// pass it here rather than sizing/stroking it ad hoc per call site.
export function Icon({
  icon: Glyph,
  size = 18,
  strokeWidth = 1.8,
  className = "",
}: {
  icon: IconComponent;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return <Glyph size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />;
}
