// A delete tool's HTTP call succeeds (200) even when the id was already gone, and reports that
// with deleted:false. The chat should say so, rather than report a delete that never happened.
// Returns the failure message for that case, or undefined when the delete really removed something.
export function missingDeleteError(name: string, data: unknown): string | undefined {
  if (!name.startsWith("delete_")) return undefined;
  if (data === null || typeof data !== "object" || (data as { deleted?: unknown }).deleted !== false) {
    return undefined;
  }
  const noun = name.slice("delete_".length).replace(/_/g, " ");
  return `No ${noun} with that id. It may already be deleted.`;
}
