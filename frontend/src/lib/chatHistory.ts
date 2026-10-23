import type { ChatMessage } from "../components/assistant/types";

// The server stores a turn's files as a trailing "[Attached a.png, b.pdf]" line (see
// chatAssistant's persistedUserText). This turns that back into names on the bubble, so reloaded
// history shows every attachment.
const STORED_ATTACHMENTS = /(?:^|\n\n)\[Attached ([^\]]+)\]$/;

// History carries only role and text. Confirmation cards, Undo and failure notes exist for the
// live session only, so a reopened conversation is text (and attachment names) and nothing more.
export function toChatMessages(turns: { role: "user" | "assistant"; content: string }[]): ChatMessage[] {
  return turns.map((t) => {
    const match = t.role === "user" ? t.content.match(STORED_ATTACHMENTS) : null;
    if (match && match.index !== undefined) {
      return { role: "user", content: t.content.slice(0, match.index), attachmentNames: match[1].split(", ") };
    }
    return { role: t.role, content: t.content };
  });
}
