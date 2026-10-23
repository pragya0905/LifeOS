import type { ChatMessage } from "../components/assistant/types";
import type { VoiceTurn } from "../hooks/useVoiceSession";

export const INTERRUPTED_NOTE = "Stopped. Anything already started may still finish. Check your list.";
export const UNANSWERED_NOTE = "Heard, but no answer came. Say it again or type it.";

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function dividerLabel(turnCount: number, ms: number): string {
  return `Voice session · ${turnCount} ${turnCount === 1 ? "turn" : "turns"} · ${formatDuration(ms)}`;
}

// The chat already holds nothing of a voice session (the server stored the turns, the page did not
// show them), so on exit the new turns are appended after one divider. Voice user turns carry a mic mark.
export function voiceTurnsToMessages(turns: VoiceTurn[], durationMs: number): ChatMessage[] {
  if (turns.length === 0) return [];
  const out: ChatMessage[] = [{ role: "assistant", content: "", divider: dividerLabel(turns.length, durationMs) }];
  for (const t of turns) {
    out.push({ role: "user", content: t.transcript, voice: true, createdAt: t.createdAt });
    const quietNotes = [...t.quietNotes];
    if (t.interrupted) quietNotes.push(INTERRUPTED_NOTE);
    if (t.unanswered && !t.interrupted) quietNotes.push(UNANSWERED_NOTE);
    // A turn cut off before any words or cards arrived has no assistant bubble except its note.
    out.push({
      role: "assistant",
      content: t.reply,
      createdAt: t.createdAt,
      toolResults: t.toolResults,
      toolFailures: t.toolFailures,
      quietNotes,
    });
  }
  return out;
}
