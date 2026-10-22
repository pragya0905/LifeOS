import type { AssistantAttachmentRef, AssistantToolResultSummary } from "../../hooks/useAssistantStream";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  // Every file sent with this user turn, by name — shown in the bubble. After a reload these
  // are rebuilt from the "[Attached …]" line the server stores with the turn.
  attachmentNames?: string[];
  // The uploaded references for a turn sent in this session, kept so Retry can resend the same
  // files. Absent for turns reloaded from history: the server keeps only the names.
  attachments?: AssistantAttachmentRef[];
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
