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

export const LOAD_ERROR = "Couldn't load this conversation";

// Decides what opening a conversation from the history sheet does with the server's answer.
// A conversation in the list always has turns, so an empty answer is a failed load, not an empty
// chat: the sheet stays open and says so, rather than closing onto a blank screen. A thrown error
// (network, server) is the same outcome.
export type OpenResult = { ok: true; messages: ChatMessage[] } | { ok: false; reason: string };

export async function openConversation(
  fetchTurns: () => Promise<{ turns: { role: "user" | "assistant"; content: string }[] }>,
): Promise<OpenResult> {
  let data: { turns: { role: "user" | "assistant"; content: string }[] };
  try {
    data = await fetchTurns();
  } catch {
    return { ok: false, reason: LOAD_ERROR };
  }
  if (!Array.isArray(data?.turns) || data.turns.length === 0) {
    return { ok: false, reason: LOAD_ERROR };
  }
  return { ok: true, messages: toChatMessages(data.turns) };
}
