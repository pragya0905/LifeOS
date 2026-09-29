import { useCallback } from "react";
import { useAuth } from "../auth/AuthContext";

const STREAM_URL = import.meta.env.VITE_ASSISTANT_STREAM_URL as string;

export type AssistantStreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_use"; name: string }
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
    ): Promise<void> => {
      const token = await getIdToken();
      const res = await fetch(STREAM_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message, conversationId }),
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
