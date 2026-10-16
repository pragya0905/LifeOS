import { useCallback } from "react";
import { useAuth } from "../auth/AuthContext";

const STREAM_URL = import.meta.env.VITE_ASSISTANT_STREAM_URL as string;

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
      mode?: "onboarding",
      attachment?: { key: string; contentType: string; fileName: string },
    ): Promise<void> => {
      const token = await getIdToken();
      const res = await fetch(STREAM_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          conversationId,
          mode,
          attachment,
          // Always sent so the model can set a medication reminder time without ever
          // guessing the user's timezone itself — see create_medication/update_medication.
          timezoneOffsetMinutes: new Date().getTimezoneOffset(),
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText}${text ? `: ${text}` : ""}`);
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
