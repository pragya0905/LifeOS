// Turns a failed tool call's raw result into the one short sentence the chat shows the user.
// Only a server-written `error` string is passed through; anything else (a stack, raw JSON, a
// Lambda or SDK message) is replaced by the fixed fallback, so internals never reach the client.
const FALLBACK = "I couldn't finish that. Try again, or check the details in the app.";
const MAX_LENGTH = 200;

export function toolErrorMessage(content: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return FALLBACK;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return FALLBACK;
  const error = (parsed as { error?: unknown }).error;
  if (typeof error !== "string" || !error.trim()) return FALLBACK;
  return error.trim().slice(0, MAX_LENGTH);
}
