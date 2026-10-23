import { useCallback } from "react";
import { useAuth } from "../auth/AuthContext";

const STREAM_URL = import.meta.env.VITE_ASSISTANT_STREAM_URL as string;

export interface AssistantAttachmentRef {
  key: string;
  contentType: string;
  fileName: string;
}

// A non-2xx answer from the stream endpoint. `message` is the server's own readable `error`
// text (e.g. "Max 10 files per message"), not the raw body, so callers can show it as-is.
export class AssistantRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AssistantRequestError";
    this.status = status;
  }
}

// Mirrors backend/src/common/toolResultSummary.ts's ToolResultSummary — no shared types
// module between the two packages (same pattern as Task/UserProfile/etc. elsewhere), so this
// is kept in sync by hand.
export interface AssistantToolResultSummary {
  itemType: string;
  id?: string;
  title: string;
  fields?: Record<string, string>;
  deleted?: boolean;
}

export type AssistantStreamEvent =
  | { type: "text"; delta: string }
  // A tool call fires this event twice: once with no `result` the moment it starts (the
  // existing "tool is running" progress signal), and — only on success, and only for tools
  // with something structured to show — a second time with `result` once it's done. `result`
  // is absent for an older backend, a failed call, or a tool with nothing to summarize; never
  // assume it's there.
  | { type: "tool_use"; name: string; result?: AssistantToolResultSummary }
  // Not sent by the backend today. If a future backend reports a failed tool call outright,
  // this is the shape the confirmation cards will pick up (see ToolCallTracker).
  | { type: "tool_error"; name: string; message?: string }
  | { type: "done"; conversationId: string }
  | { type: "error"; message: string };

// Shared by the text chat page and voice mode — both need the same raw fetch + NDJSON
// parsing, since this hits a Lambda Function URL (for response streaming) rather than the
// shared HttpApi that useApi() talks to, and carries its own bearer token accordingly.
export function useAssistantStream() {
  const { getIdToken } = useAuth();

  const sendMessage = useCallback(
    async (
      message: string,
      conversationId: string | undefined,
      onEvent: (event: AssistantStreamEvent) => void,
      mode?: "onboarding" | "voice",
      attachments?: AssistantAttachmentRef[],
      // Lets a caller cancel mid-stream (a Stop button, or unmounting while a reply is still
      // streaming in) — the fetch and the read loop below both honor it. A caller-initiated
      // abort surfaces as a real DOMException named "AbortError", not a generic failure, so
      // callers can skip showing an error toast for a stop the user asked for themselves.
      signal?: AbortSignal,
    ): Promise<void> => {
      const token = await getIdToken();
      const res = await fetch(STREAM_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          conversationId,
          mode,
          attachments,
          // Always sent so the model can set a medication reminder time without ever
          // guessing the user's timezone itself — see create_medication/update_medication.
          timezoneOffsetMinutes: new Date().getTimezoneOffset(),
        }),
        signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        let readable = "";
        try {
          readable = (JSON.parse(body) as { error?: string }).error ?? "";
        } catch {
          // Not JSON — fall through to the generic message.
        }
        throw new AssistantRequestError(res.status, readable || `Request failed (${res.status})`);
      }
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      function handleLine(line: string) {
        if (!line.trim()) return;
        try {
          onEvent(JSON.parse(line) as AssistantStreamEvent);
        } catch {
          // A malformed NDJSON line shouldn't abort an otherwise-good stream.
        }
      }

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) handleLine(line);
      }
      handleLine(buffer);
    },
    [getIdToken],
  );

  return { sendMessage };
}
