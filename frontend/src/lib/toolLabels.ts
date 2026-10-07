// Turns a tool name like "create_routine_template" into "Creating routine template…" — a
// transient status shown while a multi-tool turn is in progress (creating a routine, checking
// the weather, etc.) can otherwise take several seconds with zero visible feedback beyond a
// static typing indicator, which reads as broken rather than busy. Programmatic rather than a
// per-tool lookup table so any tool added later automatically gets a reasonable label.
const TOOL_VERB_LABELS: Record<string, string> = {
  create: "Creating",
  update: "Updating",
  delete: "Deleting",
  get: "Checking",
  set: "Setting",
  log: "Logging",
  search: "Searching",
  remember: "Remembering",
  forget: "Forgetting",
};

export function describeToolUse(name: string): string {
  const [verb, ...rest] = name.split("_");
  const label = TOOL_VERB_LABELS[verb] ?? "Working on";
  const subject = rest.join(" ");
  return subject ? `${label} ${subject}…` : `${label}…`;
}
