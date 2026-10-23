// Builds the POST /tasks body for the create_task tool. With no priority, the body is exactly
// what it was before: the app's own AI suggestion decides priority. A valid priority the user
// stated is sent as-is and skips that model call (the REST handler honours it only when
// suggestPriority is not true). Invalid values are dropped, never forwarded.
const PRIORITIES = ["Low", "Medium", "High"];
const MAX_CATEGORY_LENGTH = 40;

export function createTaskBody(input: Record<string, unknown>): Record<string, unknown> {
  const priority = PRIORITIES.includes(input.priority as string) ? (input.priority as string) : undefined;
  const estimatedHours =
    typeof input.estimatedHours === "number" && Number.isFinite(input.estimatedHours) && input.estimatedHours > 0
      ? input.estimatedHours
      : undefined;
  const category =
    typeof input.category === "string" && input.category.trim() && input.category.trim().length <= MAX_CATEGORY_LENGTH
      ? input.category.trim()
      : undefined;

  return {
    title: input.title,
    description: input.description,
    dueDate: input.dueDate,
    dueTime: input.dueTime,
    recurrence: input.recurrence,
    ...(priority ? { priority } : { suggestPriority: true }),
    ...(estimatedHours !== undefined ? { estimatedHours } : {}),
    ...(category !== undefined ? { category } : {}),
  };
}
