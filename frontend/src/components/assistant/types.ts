import type { AssistantToolResultSummary } from "../../hooks/useAssistantStream";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  attachmentLabel?: string;
  // Stamped client-side the moment a message is appended during this session — history
  // replayed from the server (GET /assistant/conversations/:id) carries no per-turn
  // timestamp today, so this is absent for reopened conversations; the tap-to-reveal
  // timestamp simply doesn't render in that case rather than showing something invented.
  createdAt?: string;
  // Collected from this turn's tool_use events that carried a `result` — the reserved slot
  // for Part 3's confirmation cards. Only ever populated for a successful call with
  // something to summarize; never present for a failed one (see toolResultSummary.ts).
  toolResults?: AssistantToolResultSummary[];
}
