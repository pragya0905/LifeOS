// Unifies three previously-independent "how urgent/healthy is this" color schemes
// (task priority, deadline-ring urgency, medication adherence) onto one shared mapping,
// so "high urgency" always reads as alert/red, "medium" as amber, and "fine" as success
// green — never the bloom brand accent, which used to leak into a couple of these as a
// stand-in for "good" and competed with the actual brand meaning.
export type UrgencyLevel = "low" | "medium" | "high";

export const URGENCY_BADGE_CLASS: Record<UrgencyLevel, string> = {
  low: "bg-success-soft text-success-ink dark:bg-success-soft-dark dark:text-success-ink-dark",
  medium: "bg-amber-soft text-amber-ink dark:bg-amber-soft-dark dark:text-amber-ink-dark",
  high: "bg-alert-soft text-alert dark:bg-alert-soft-dark dark:text-alert-light",
};

export const URGENCY_STROKE_CLASS: Record<UrgencyLevel, string> = {
  low: "stroke-success",
  medium: "stroke-amber",
  high: "stroke-alert",
};

export const URGENCY_BORDER_CLASS: Record<UrgencyLevel, string> = {
  low: "border-l-success",
  medium: "border-l-amber",
  high: "border-l-alert",
};

export const URGENCY_DOT_CLASS: Record<UrgencyLevel, string> = {
  low: "bg-success",
  medium: "bg-amber",
  high: "bg-alert",
};
